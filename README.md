# Smart Bus Booking System

A full-stack MERN application for booking bus tickets online with role-based access control.

## User Roles
- **Admin** – manages buses, routes, schedules, and users
- **Customer (User)** – searches buses and books tickets
- **Bus Operator** – manages only their assigned buses and passengers

## Tech Stack
- **MongoDB** – database
- **Express.js** – backend framework
- **React.js (Vite)** – frontend
- **Node.js** – runtime environment

## Project Structure

```
smartbusbooking/
├── backend/                             # Node.js + Express API server
│   ├── algorithms/                      # Route planning and seat lock modules
│   │   ├── graph/
│   │   │   ├── dijkstra.js
│   │   │   ├── graphBuilder.js
│   │   │   └── routePlanFormatter.js
│   │   ├── routePlanning/
│   │   │   ├── dijkstraManager.js
│   │   │   ├── graphBuilder.js
│   │   │   ├── routePlanningService.js
│   │   │   ├── routeValidator.js
│   │   │   └── *.test.js
│   │   ├── routeSegment/
│   │   │   ├── routePathBuilder.js
│   │   │   ├── routeSegmentManager.js
│   │   │   ├── routeSegmentService.js
│   │   │   ├── routeSegmentValidator.js
│   │   │   └── *.test.js
│   │   ├── seatLock/
│   │   │   ├── lockCleanup.js
│   │   │   ├── seatLockManager.js
│   │   │   ├── seatLockService.js
│   │   │   ├── seatLockValidator.js
│   │   │   └── seatLockManager.test.js
│   │   └── index.js
│   ├── config/
│   │   ├── config.js
│   │   └── db.js
│   ├── controllers/
│   │   ├── admin.controller.js
│   │   ├── auth.controller.js
│   │   ├── booking.controller.js
│   │   ├── bus.controller.js
│   │   ├── district.controller.js
│   │   ├── location.controller.js
│   │   ├── operator.controller.js
│   │   ├── payment.controller.js
│   │   ├── route.controller.js
│   │   ├── schedule.controller.js
│   │   ├── seatLock.controller.js
│   │   ├── stop.controller.js
│   │   └── user.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── role.middleware.js
│   │   └── upload.middleware.js
│   ├── models/
│   │   ├── Booking.js
│   │   ├── Bus.js
│   │   ├── City.js
│   │   ├── District.js
│   │   ├── Notification.js
│   │   ├── Route.js
│   │   ├── Schedule.js
│   │   ├── SeatLock.js
│   │   ├── Stop.js
│   │   └── User.js
│   ├── routes/
│   │   ├── admin.routes.js
│   │   ├── auth.routes.js
│   │   ├── booking.routes.js
│   │   ├── bus.routes.js
│   │   ├── district.routes.js
│   │   ├── location.routes.js
│   │   ├── operator.routes.js
│   │   ├── payment.routes.js
│   │   ├── route.routes.js
│   │   ├── schedule.routes.js
│   │   ├── seatLock.routes.js
│   │   ├── stop.routes.js
│   │   └── user.routes.js
│   ├── seed/
│   │   └── seedData.js
│   ├── services/
│   │   ├── districtData.service.js
│   │   ├── email.service.js
│   │   └── notification.service.js
│   ├── uploads/
│   │   └── buses/
│   ├── utils/
│   │   ├── fareCalculator.js
│   │   ├── mailer.js
│   │   ├── passwordResetMailer.js
│   │   ├── routePoints.js
│   │   ├── routePoints.test.js
│   │   ├── ticketPdf.js
│   │   └── ticketTemplate.js
│   ├── server.js
│   └── package.json
├── frontend/                            # React + Vite application
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   ├── operator/
│   │   │   ├── search/
│   │   │   ├── seats/
│   │   │   ├── ticket/
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── BookingCard.jsx
│   │   │   ├── BusCard.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   └── SeatMap.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── operator/
│   │   │   ├── user/
│   │   │   ├── ForgotPasswordPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   └── ResetPasswordPage.jsx
│   │   ├── services/
│   │   │   ├── admin.service.js
│   │   │   ├── auth.service.js
│   │   │   ├── axios.js
│   │   │   ├── booking.service.js
│   │   │   ├── operator.service.js
│   │   │   └── user.service.js
│   │   ├── utils/
│   │   │   ├── authStorage.js
│   │   │   ├── busTypeUtils.js
│   │   │   └── helpers.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── trip-booking.html
│   └── vite.config.js
├── src/                                 # Reserved/empty root source folder
├── .github/
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+ recommended
- MongoDB running locally (or set `MONGO_URI` to MongoDB Atlas)

### Backend
```bash
cd backend
npm install
cp .env.example .env   # configure your environment variables
npm run seed            # optional: create demo users + schedules
npm run dev
```

**Windows note:** if PowerShell blocks `npm` with an execution policy error, use `npm.cmd` instead (e.g. `npm.cmd install`).

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables (backend/.env)
```
PORT=5001
MONGO_URI=mongodb://localhost:27017/smartbusbooking
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Used for payment redirects/callback URLs
FRONTEND_URL=http://localhost:5173
PUBLIC_BASE_URL=http://localhost:5001

# Require online payment to confirm bookings
REQUIRE_ONLINE_PAYMENT=true

# eSewa ePay v2 (TEST / RC)
ESEWA_PRODUCT_CODE=EPAYTEST
ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q
ESEWA_FORM_URL=https://rc-epay.esewa.com.np/api/epay/main/v2/form
ESEWA_STATUS_URL=https://rc.esewa.com.np/api/epay/transaction/status/

# SMTP (required to email tickets after successful payment)
# Gmail example (IMPORTANT: use an App Password, not your normal Gmail password)
# 1) Enable 2‑Step Verification on your Google account
# 2) Create an App Password: https://myaccount.google.com/apppasswords
# 3) Use that 16‑character App Password in SMTP_PASSWORD
SMTP_PROVIDER=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_ADDRESS=your_gmail@gmail.com
```

## Environment Variables (frontend/.env)
```bash
VITE_API_URL=http://localhost:5001/api
```

You can copy the frontend template and edit it:

```bash
cd frontend
cp .env.example .env
```

## Production Deployment Notes

For frontend deployments (Vercel/Netlify), set:

```bash
VITE_API_URL=https://your-public-backend-domain/api
```

Important:
- Use a public HTTPS backend URL. Mobile devices cannot access localhost on your laptop.
- Keep the trailing /api segment in VITE_API_URL.
- After changing env vars on your hosting provider, redeploy the frontend.

Quick health check from phone browser:

```text
https://your-public-backend-domain/api/health
```
