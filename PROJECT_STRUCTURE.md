# SmartBusBooking Project Structure

Generated on 2026-05-08.

Notes:
- Excludes .git/ (git metadata)
- Excludes backend.worktrees/ (local worktree copies)
- Empty directories are labeled "(empty)"

```
smartbusbooking/
|-- .github/
|   |-- agents/
|       |-- busbooking-admin-panel.agent.md
|-- .vscode/
|   |-- tasks.json
|-- backend/
|   |-- .env.example
|   |-- package.json
|   |-- package-lock.json
|   |-- server.js
|   |-- algorithms/
|   |   |-- index.js
|   |   |-- graph/
|   |   |   |-- dijkstra.js
|   |   |   |-- graphBuilder.js
|   |   |   |-- routePlanFormatter.js
|   |   |-- routePlanning/
|   |   |   |-- dijkstraManager.js
|   |   |   |-- dijkstraManager.test.js
|   |   |   |-- graphBuilder.js
|   |   |   |-- graphBuilder.test.js
|   |   |   |-- index.js
|   |   |   |-- routeFormatter.js
|   |   |   |-- routePlanningService.js
|   |   |   |-- routePlanningService.test.js
|   |   |   |-- routeValidator.js
|   |   |-- routeSegment/
|   |   |   |-- index.js
|   |   |   |-- routePathBuilder.js
|   |   |   |-- routePathBuilder.test.js
|   |   |   |-- routeSegmentFormatter.js
|   |   |   |-- routeSegmentManager.js
|   |   |   |-- routeSegmentManager.test.js
|   |   |   |-- routeSegmentService.js
|   |   |   |-- routeSegmentService.test.js
|   |   |   |-- routeSegmentValidator.js
|   |   |-- seatLock/
|   |   |   |-- index.js
|   |   |   |-- lockCleanup.js
|   |   |   |-- seatLockManager.js
|   |   |   |-- seatLockManager.test.js
|   |   |   |-- seatLockService.js
|   |   |   |-- seatLockValidator.js
|   |-- config/
|   |   |-- cloudinary.js
|   |   |-- config.js
|   |   |-- db.js
|   |-- controllers/
|   |   |-- auth.controller.js
|   |   |-- booking.controller.js
|   |   |-- bus.controller.js
|   |   |-- district.controller.js
|   |   |-- location.controller.js
|   |   |-- payment.controller.js
|   |   |-- payment.controller.test.js
|   |   |-- route.controller.js
|   |   |-- schedule.controller.js
|   |   |-- seatLock.controller.js
|   |   |-- stop.controller.js
|   |-- middleware/
|   |   |-- auth.middleware.js
|   |   |-- role.middleware.js
|   |   |-- upload.middleware.js
|   |-- models/
|   |   |-- Booking.js
|   |   |-- Bus.js
|   |   |-- City.js
|   |   |-- District.js
|   |   |-- Notification.js
|   |   |-- Route.js
|   |   |-- Schedule.js
|   |   |-- SeatLock.js
|   |   |-- Stop.js
|   |   |-- User.js
|   |-- modules/
|   |   |-- admin/
|   |   |   |-- admin.controller.js
|   |   |   |-- admin.model.js
|   |   |   |-- admin.routes.js
|   |   |   |-- admin.service.js
|   |   |-- booking/
|   |   |   |-- booking.controller.js
|   |   |   |-- booking.model.js
|   |   |   |-- booking.routes.js
|   |   |   |-- booking.service.js
|   |   |   |-- booking.utils.js
|   |   |   |-- booking.validation.js
|   |   |-- bus/
|   |   |   |-- bus.controller.js
|   |   |   |-- bus.model.js
|   |   |   |-- bus.routes.js
|   |   |   |-- bus.service.js
|   |   |   |-- bus.validation.js
|   |   |-- operator/
|   |   |   |-- operator.controller.js
|   |   |   |-- operator.model.js
|   |   |   |-- operator.routes.js
|   |   |   |-- operator.service.js
|   |   |-- payment/
|   |   |   |-- payment.controller.js
|   |   |   |-- payment.model.js
|   |   |   |-- payment.routes.js
|   |   |   |-- payment.service.js
|   |   |   |-- payment.validation.js
|   |   |-- seat/
|   |   |   |-- seat.controller.js
|   |   |   |-- seat.model.js
|   |   |   |-- seat.routes.js
|   |   |   |-- seat.service.js
|   |   |   |-- seat.utils.js
|   |   |   |-- seat.validation.js
|   |   |-- user/
|   |   |   |-- user.controller.js
|   |   |   |-- user.model.js
|   |   |   |-- user.routes.js
|   |   |   |-- user.service.js
|   |-- routes/
|   |   |-- auth.routes.js
|   |   |-- booking.routes.js
|   |   |-- bus.routes.js
|   |   |-- district.routes.js
|   |   |-- index.js
|   |   |-- location.routes.js
|   |   |-- payment.routes.js
|   |   |-- route.routes.js
|   |   |-- schedule.routes.js
|   |   |-- seatLock.routes.js
|   |   |-- stop.routes.js
|   |-- scripts/
|   |   |-- cleanupInvalidSchedules.js
|   |   |-- syncAllRoutePoints.js
|   |-- seed/
|   |   |-- seedData.js
|   |-- services/
|   |   |-- districtData.service.js
|   |   |-- email.service.js
|   |   |-- notification.service.js
|   |   |-- routePointSync.service.js
|   |-- uploads/
|   |   |-- buses/
|   |   |   |-- bus-bus-1776593372417-693775354.jpg
|   |   |   |-- bus-seat-layout-1776593372432-897028015.jpg
|   |   |   |-- bus-sleeper-layout-1776593372444-654007787.jpg
|   |-- utils/
|   |   |-- apiError.js
|   |   |-- apiResponse.js
|   |   |-- bookingState.js
|   |   |-- controllerHelpers.js
|   |   |-- fareCalculator.js
|   |   |-- mailer.js
|   |   |-- passwordResetMailer.js
|   |   |-- routePoints.js
|   |   |-- routePoints.test.js
|   |   |-- ticketPdf.js
|   |   |-- ticketTemplate.js
|   |   |-- ticketTemplate.test.js
|-- frontend/
|   |-- .env.example
|   |-- .env.production
|   |-- index.html
|   |-- package.json
|   |-- package-lock.json
|   |-- postcss.config.js
|   |-- README.md
|   |-- tailwind.config.js
|   |-- trip-booking.html
|   |-- vite.config.js
|   |-- public/
|   |   |-- images/ (empty)
|   |   |-- models/
|   |   |   |-- bus.glb
|   |-- src/
|   |   |-- App.jsx
|   |   |-- index.css
|   |   |-- main.jsx
|   |   |-- components/
|   |   |   |-- AdminLayout.jsx
|   |   |   |-- BookingCard.jsx
|   |   |   |-- BusCard.jsx
|   |   |   |-- ErrorBoundary.jsx
|   |   |   |-- Navbar.jsx
|   |   |   |-- ProtectedRoute.jsx
|   |   |   |-- SeatMap.jsx
|   |   |   |-- auth/
|   |   |   |   |-- AuthSliderPage.jsx
|   |   |   |-- hero/
|   |   |   |   |-- HimalayaHeroScene.jsx
|   |   |   |-- ticket/
|   |   |   |   |-- TicketCard.jsx
|   |   |   |-- seats/
|   |   |   |   |-- BookingSummaryPanel.jsx
|   |   |   |   |-- BusImageGalleryModal.jsx
|   |   |   |   |-- PassengerDetailsPanel.jsx
|   |   |   |   |-- SeatDeckMap.jsx
|   |   |   |-- search/
|   |   |   |   |-- BusResultCard.jsx
|   |   |   |   |-- DatePicker.jsx
|   |   |   |   |-- FilterSection.jsx
|   |   |   |   |-- FilterSidebar.jsx
|   |   |   |   |-- FilterTagList.jsx
|   |   |   |   |-- LocationAutocompleteInput.jsx
|   |   |   |   |-- PriceSlider.jsx
|   |   |   |   |-- SearchHeader.jsx
|   |   |   |   |-- SortDropdown.jsx
|   |   |   |   |-- SwapButton.jsx
|   |   |   |-- operator/
|   |   |   |   |-- BusForm.jsx
|   |   |   |   |-- OperatorLayout.jsx
|   |   |   |   |-- ScheduleForm.jsx
|   |   |   |   |-- Sidebar.jsx
|   |   |   |   |-- StatsCard.jsx
|   |   |   |   |-- Topbar.jsx
|   |   |   |-- admin/
|   |   |   |   |-- AdminLayout.jsx
|   |   |   |   |-- BusModal.jsx
|   |   |   |   |-- CityModal.jsx
|   |   |   |   |-- ConfirmDialog.jsx
|   |   |   |   |-- DistrictModal.jsx
|   |   |   |   |-- GlobalSearch.jsx
|   |   |   |   |-- NotificationDropdown.jsx
|   |   |   |   |-- ProfileDropdown.jsx
|   |   |   |   |-- Sidebar.jsx
|   |   |   |   |-- StopEditorRow.jsx
|   |   |   |   |-- Topbar.jsx
|   |   |   |   |-- dashboard/
|   |   |   |   |   |-- BookingsRevenueChart.jsx
|   |   |   |   |-- routes/
|   |   |   |   |   |-- ConfirmDialog.jsx
|   |   |   |   |   |-- RouteDetailPanel.jsx
|   |   |   |   |   |-- RouteList.jsx
|   |   |   |   |   |-- RouteModal.jsx
|   |   |   |   |   |-- StopEditor.jsx
|   |   |   |   |   |-- StopModal.jsx
|   |   |   |   |-- schedules/
|   |   |   |   |   |-- MultiDatePicker.jsx
|   |   |   |   |   |-- RouteScheduleGroup.jsx
|   |   |   |   |   |-- ScheduleCard.jsx
|   |   |   |   |   |-- ScheduleFilters.jsx
|   |   |   |   |   |-- SegmentedTimePicker.jsx
|   |   |   |   |-- stops/
|   |   |   |   |   |-- CityList.jsx
|   |   |   |   |   |-- CityModal.jsx
|   |   |   |   |   |-- ConfirmDialog.jsx
|   |   |   |   |   |-- DistrictList.jsx
|   |   |   |   |   |-- DistrictModal.jsx
|   |   |   |   |   |-- ManageStops.jsx
|   |   |   |   |   |-- StopCard.jsx
|   |   |   |   |   |-- StopModal.jsx
|   |   |-- context/
|   |   |   |-- AuthContext.jsx
|   |   |-- hooks/
|   |   |   |-- useRequireAuth.jsx
|   |   |-- pages/
|   |   |   |-- ForgotPasswordPage.jsx
|   |   |   |-- LoginPage.jsx
|   |   |   |-- RegisterPage.jsx
|   |   |   |-- ResetPasswordPage.jsx
|   |   |   |-- admin/
|   |   |   |   |-- AdminDashboard.jsx
|   |   |   |   |-- ManageBookings.jsx
|   |   |   |   |-- ManageBuses.jsx
|   |   |   |   |-- ManageRoutes.jsx
|   |   |   |   |-- ManageSchedules.jsx
|   |   |   |   |-- ManageStops.jsx
|   |   |   |   |-- ManageUsers.jsx
|   |   |   |   |-- Settings.jsx
|   |   |   |-- operator/
|   |   |   |   |-- ManageBuses.jsx
|   |   |   |   |-- ManageSchedules.jsx
|   |   |   |   |-- MyBuses.jsx
|   |   |   |   |-- OperatorDashboard.jsx
|   |   |   |   |-- OperatorProfile.jsx
|   |   |   |   |-- OperatorSettings.jsx
|   |   |   |   |-- PassengerList.jsx
|   |   |   |   |-- PassengersPage.jsx
|   |   |   |   |-- ReportsPage.jsx
|   |   |   |   |-- RoutesPage.jsx
|   |   |   |   |-- ViewBookings.jsx
|   |   |   |-- user/
|   |   |   |   |-- BookingPage.jsx
|   |   |   |   |-- DashboardPage.jsx
|   |   |   |   |-- HomePage.jsx
|   |   |   |   |-- SearchPage.jsx
|   |   |   |   |-- TicketPage.jsx
|   |   |-- services/
|   |   |   |-- admin.service.js
|   |   |   |-- auth.service.js
|   |   |   |-- axios.js
|   |   |   |-- booking.service.js
|   |   |   |-- operator.service.js
|   |   |   |-- user.service.js
|   |   |-- utils/
|   |   |   |-- authStorage.js
|   |   |   |-- busTypeUtils.js
|   |   |   |-- helpers.js
|-- src/ (empty)
|-- .gitignore
|-- netlify.toml
|-- package.json
|-- README.md
|-- vercel.json
```
