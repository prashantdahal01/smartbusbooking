const { Bus } = require("../bus/bus.model");
const { City } = require("../location/location.model");
const { Route } = require("../route/route.model");
const { Schedule } = require("../schedule/schedule.model");
const { Stop } = require("../stop/stop.model");
const { User } = require("../user/user.model");
const { Booking } = require("../booking/booking.model");
const { Notification } = require("../notification/notification.model");

module.exports = {
  Bus,
  City,
  Route,
  Schedule,
  Stop,
  User,
  Booking,
  Notification,
};
