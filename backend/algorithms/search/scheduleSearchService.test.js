const test = require('node:test');
const assert = require('node:assert/strict');

const searchService = require('./searchService');
const { Schedule } = require('../../modules/schedule/schedule.model');
const { Booking } = require('../../modules/booking/booking.model');
const { SeatLock } = require('../../modules/seatLock/seatLock.model');
const { routeSegmentService } = require('../routeSegment');

const originalScheduleFind = Schedule.find;
const originalBookingAgg = Booking.aggregate;
const originalSeatLockAgg = SeatLock.aggregate;
const originalIsValidSegment = routeSegmentService.isValidSegment;

const baseDate = '2025-05-15';

const makeSchedule = (overrides = {}) => ({
  _id: overrides._id || '000000000000000000000001',
  date: overrides.date || baseDate,
  time: overrides.time || '08:00',
  price: overrides.price ?? 100,
  durationMinutes: overrides.durationMinutes ?? 120,
  isActive: overrides.isActive !== false,
  bus: {
    _id: overrides.busId || 'b1',
    totalSeats: overrides.totalSeats ?? 2,
    busTypes: overrides.busTypes || ['AC'],
    operator: overrides.operator || '0000000000000000000000a1',
    isActive: overrides.busActive !== false,
  },
  route: overrides.route || { _id: overrides.routeId || 'r1' },
});

const busMatches = (bus, match = {}) => {
  if (!bus) return false;
  if (match.isActive === true && bus.isActive === false) return false;
  if (match.busTypes && match.busTypes.$in) {
    const busTypes = Array.isArray(bus.busTypes) ? bus.busTypes : [];
    const matchSet = match.busTypes.$in.map((value) => String(value));
    if (!busTypes.some((value) => matchSet.includes(String(value)))) return false;
  }
  if (match.operator && String(bus.operator) !== String(match.operator)) return false;
  return true;
};

const makeFindStub = (schedules = []) => (filter = {}) => {
  const chain = {
    busMatch: null,
    populate(arg) {
      if (arg && typeof arg === 'object' && arg.path === 'bus') {
        this.busMatch = arg.match || {};
      }
      return this;
    },
    async lean() {
      let results = schedules.slice();
      if (filter.date) {
        results = results.filter((s) => s.date === filter.date);
      }
      if (filter.isActive && filter.isActive.$ne === false) {
        results = results.filter((s) => s.isActive !== false);
      }
      if (this.busMatch && Object.keys(this.busMatch).length) {
        results = results.map((s) => (busMatches(s.bus, this.busMatch) ? s : { ...s, bus: null }));
      }
      return results;
    },
  };
  return chain;
};

test.beforeEach(() => {
  Schedule.find = makeFindStub([]);
  Booking.aggregate = async () => [];
  SeatLock.aggregate = async () => [];
  routeSegmentService.isValidSegment = async () => true;
});

test.after(() => {
  Schedule.find = originalScheduleFind;
  Booking.aggregate = originalBookingAgg;
  SeatLock.aggregate = originalSeatLockAgg;
  routeSegmentService.isValidSegment = originalIsValidSegment;
});

test('searchService.searchSchedules: returns 400 when required params are missing', async () => {
  await assert.rejects(
    () => searchService.searchSchedules({ query: { from: 'Kathmandu', to: 'Pokhara' } }),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    }
  );

  await assert.rejects(
    () => searchService.searchSchedules({ query: { from: 'Kathmandu', date: baseDate } }),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    }
  );

  await assert.rejects(
    () => searchService.searchSchedules({ query: { to: 'Pokhara', date: baseDate } }),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test('searchService.searchSchedules: returns 400 when from and to are the same stop', async () => {
  await assert.rejects(
    () => searchService.searchSchedules({ query: { from: 'Kathmandu', to: 'Kathmandu', date: baseDate } }),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test('searchService.searchSchedules: filters out schedules with invalid segment direction', async () => {
  const schedules = [
    makeSchedule({ _id: '000000000000000000000001', routeId: 'r1' }),
    makeSchedule({ _id: '000000000000000000000002', routeId: 'r2', time: '09:00' }),
  ];

  Schedule.find = makeFindStub(schedules);
  routeSegmentService.isValidSegment = async (route) => route._id === 'r2';

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]._id, schedules[1]._id);
});

test('searchService.searchSchedules: applies busType filter correctly', async () => {
  const schedules = [
    makeSchedule({ _id: '000000000000000000000011', busTypes: ['AC', 'SLEEPER'] }),
    makeSchedule({ _id: '000000000000000000000012', busTypes: ['AC', 'SEATER'] }),
  ];

  Schedule.find = makeFindStub(schedules);

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate, busType: 'SLEEPER' },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]._id, schedules[0]._id);
});

test('searchService.searchSchedules: applies operator filter correctly', async () => {
  const operatorA = '0000000000000000000000a1';
  const operatorB = '0000000000000000000000b2';

  const schedules = [
    makeSchedule({ _id: '000000000000000000000021', operator: operatorA }),
    makeSchedule({ _id: '000000000000000000000022', operator: operatorB }),
  ];

  Schedule.find = makeFindStub(schedules);

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate, operator: operatorA },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]._id, schedules[0]._id);
});

test('searchService.searchSchedules: applies minPrice and maxPrice filters', async () => {
  const schedules = [
    makeSchedule({ _id: '000000000000000000000031', price: 50 }),
    makeSchedule({ _id: '000000000000000000000032', price: 100 }),
    makeSchedule({ _id: '000000000000000000000033', price: 200 }),
  ];

  Schedule.find = makeFindStub(schedules);

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate, minPrice: 80, maxPrice: 150 },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]._id, schedules[1]._id);
});

test('searchService.searchSchedules: sorts by price ascending', async () => {
  const schedules = [
    makeSchedule({ _id: '000000000000000000000041', price: 200 }),
    makeSchedule({ _id: '000000000000000000000042', price: 50 }),
    makeSchedule({ _id: '000000000000000000000043', price: 100 }),
  ];

  Schedule.find = makeFindStub(schedules);

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate, sortBy: 'price' },
  });

  assert.deepEqual(results.map((r) => r._id), [schedules[1]._id, schedules[2]._id, schedules[0]._id]);
});

test('searchService.searchSchedules: sorts by departure ascending', async () => {
  const schedules = [
    makeSchedule({ _id: '000000000000000000000051', time: '10:00' }),
    makeSchedule({ _id: '000000000000000000000052', time: '08:00' }),
    makeSchedule({ _id: '000000000000000000000053', time: '12:00' }),
  ];

  Schedule.find = makeFindStub(schedules);

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate, sortBy: 'departure' },
  });

  assert.deepEqual(results.map((r) => r._id), [schedules[1]._id, schedules[0]._id, schedules[2]._id]);
});

test('searchService.searchSchedules: full buses appear last regardless of sort', async () => {
  const schedules = [
    makeSchedule({ _id: '000000000000000000000061', price: 10, totalSeats: 2 }),
    makeSchedule({ _id: '000000000000000000000062', price: 100, totalSeats: 2, time: '09:00' }),
  ];

  Schedule.find = makeFindStub(schedules);
  Booking.aggregate = async () => [
    { _id: schedules[0]._id, bookedCount: 2 },
    { _id: schedules[1]._id, bookedCount: 0 },
  ];

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate, sortBy: 'price' },
  });

  assert.deepEqual(results.map((r) => r._id), [schedules[1]._id, schedules[0]._id]);
});

test('searchService.searchSchedules: returns empty array when no schedules exist for date', async () => {
  const schedules = [
    makeSchedule({ _id: '000000000000000000000071', date: '2025-06-01' }),
  ];

  Schedule.find = makeFindStub(schedules);

  const results = await searchService.searchSchedules({
    query: { from: 'Kathmandu', to: 'Pokhara', date: baseDate },
  });

  assert.deepEqual(results, []);
});
