const test = require("node:test");
const assert = require("node:assert/strict");

const { Booking } = require("../../modules/booking/booking.model");
const { Review } = require("../../models/Review");
const {
  submitReview,
  getBusReviews,
  getUserReviews,
  RatingServiceError,
} = require("./ratingService");

const originalFns = {
  bookingFindById: Booking.findById,
  reviewFindOne: Review.findOne,
  reviewCreate: Review.create,
  reviewFind: Review.find,
};

const restoreMocks = () => {
  Booking.findById = originalFns.bookingFindById;
  Review.findOne = originalFns.reviewFindOne;
  Review.create = originalFns.reviewCreate;
  Review.find = originalFns.reviewFind;
};

test.afterEach(() => {
  restoreMocks();
});

const createBookingFindByIdMock = (bookingDoc) => {
  Booking.findById = () => ({
    populate: () => ({
      lean: async () => bookingDoc,
    }),
  });
};

const createReviewFindOneMock = (reviewDoc) => {
  Review.findOne = () => ({
    select: () => ({
      lean: async () => reviewDoc,
    }),
  });
};

test("submitReview: creates review when booking is completed and eligible", async () => {
  createBookingFindByIdMock({
    _id: "booking-1",
    user: "user-1",
    status: "confirmed",
    schedule: {
      date: "2026-01-01",
      time: "09:00",
      bus: { _id: "bus-1" },
    },
  });
  createReviewFindOneMock(null);

  let payload = null;
  Review.create = async (data) => {
    payload = { ...data };
    return { _id: "review-1", ...data };
  };

  const review = await submitReview({
    bookingId: "booking-1",
    busId: "bus-1",
    userId: "user-1",
    rating: 5,
    comment: "Great service",
  });

  assert.equal(String(review._id), "review-1");
  assert.equal(payload.bookingId, "booking-1");
  assert.equal(payload.busId, "bus-1");
  assert.equal(payload.userId, "user-1");
  assert.equal(payload.rating, 5);
  assert.equal(payload.comment, "Great service");
});

test("submitReview: blocks duplicate review for same booking", async () => {
  createBookingFindByIdMock({
    _id: "booking-2",
    user: "user-2",
    status: "confirmed",
    schedule: {
      date: "2026-01-01",
      time: "09:00",
      bus: { _id: "bus-2" },
    },
  });
  createReviewFindOneMock({ _id: "existing-review" });

  await assert.rejects(
    () => submitReview({
      bookingId: "booking-2",
      busId: "bus-2",
      userId: "user-2",
      rating: 4,
      comment: "Nice",
    }),
    (error) => {
      assert.equal(error instanceof RatingServiceError, true);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "REVIEW_ALREADY_EXISTS");
      return true;
    }
  );
});

test("getBusReviews: returns mapped bus reviews with user names", async () => {
  Review.find = () => ({
    sort: () => ({
      populate: () => ({
        lean: async () => ([
          {
            _id: "r-1",
            rating: 5,
            comment: "Excellent",
            createdAt: "2026-01-02T10:00:00.000Z",
            userId: { name: "Alice" },
          },
          {
            _id: "r-2",
            rating: 3,
            comment: "",
            createdAt: "2026-01-01T10:00:00.000Z",
            userId: null,
          },
        ]),
      }),
    }),
  });

  const reviews = await getBusReviews("bus-1");

  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].id, "r-1");
  assert.equal(reviews[0].userName, "Alice");
  assert.equal(reviews[0].rating, 5);
  assert.equal(reviews[1].userName, "Anonymous");
});

test("getUserReviews: maps user reviews with bus and booking context", async () => {
  Review.find = () => ({
    sort: () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => ([
            {
              _id: "review-user-1",
              rating: 4,
              comment: "Good trip",
              createdAt: "2026-01-03T10:00:00.000Z",
              busId: { _id: "bus-9", name: "Night Rider" },
              bookingId: {
                _id: "booking-9",
                schedule: { date: "2026-01-10" },
              },
            },
          ]),
        }),
      }),
    }),
  });

  const reviews = await getUserReviews("user-9");

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].id, "review-user-1");
  assert.equal(reviews[0].busId, "bus-9");
  assert.equal(reviews[0].busName, "Night Rider");
  assert.equal(reviews[0].bookingId, "booking-9");
  assert.equal(reviews[0].journeyDate, "2026-01-10");
});
