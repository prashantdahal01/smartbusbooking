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
smart-bus-booking-system/
├── backend/                        # Node.js + Express API server
│   ├── config/
│   │   └── db.js                   # MongoDB connection setup
│   ├── controllers/
│   │   ├── auth.controller.js      # Login, register, token handling
│   │   ├── user.controller.js      # User profile management
│   │   ├── admin.controller.js     # Admin-level operations
│   │   ├── operator.controller.js  # Operator-level operations
│   │   ├── booking.controller.js   # Booking creation and management
│   │   ├── bus.controller.js       # Bus CRUD operations
│   │   ├── route.controller.js     # Route CRUD operations
│   │   └── schedule.controller.js  # Schedule CRUD operations
│   ├── models/
│   │   ├── User.js                 # User schema (admin, customer, operator)
│   │   ├── Bus.js                  # Bus schema
│   │   ├── Route.js                # Route schema with stops
│   │   ├── Schedule.js             # Schedule schema linking bus and route
│   │   ├── Booking.js              # Booking schema
│   │   └── SeatLock.js             # Temporary seat lock schema
│   ├── routes/
│   │   ├── auth.routes.js          # /api/auth endpoints
│   │   ├── user.routes.js          # /api/users endpoints
│   │   ├── admin.routes.js         # /api/admin endpoints
│   │   ├── operator.routes.js      # /api/operator endpoints
│   │   ├── booking.routes.js       # /api/bookings endpoints
│   │   ├── bus.routes.js           # /api/buses endpoints
│   │   ├── route.routes.js         # /api/routes endpoints
│   │   └── schedule.routes.js      # /api/schedules endpoints
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT token verification
│   │   └── role.middleware.js      # Role-based access control
│   ├── utils/
│   │   ├── dijkstra.js             # Dijkstra's algorithm for shortest route
│   │   └── fareCalculator.js       # Fare calculation based on distance/route
│   ├── seed/
│   │   └── seedData.js             # Sample data for development/testing
│   ├── server.js                   # Express app entry point
│   ├── .env                        # Environment variables (not committed)
│   └── package.json                # Backend dependencies
│
├── frontend/                       # React + Vite application
│   ├── src/
│   │   ├── pages/
│   │   │   ├── user/
│   │   │   │   ├── HomePage.jsx        # Customer landing/home page
│   │   │   │   ├── SearchPage.jsx      # Search buses by route/date
│   │   │   │   ├── BookingPage.jsx     # Seat selection and booking form
│   │   │   │   └── DashboardPage.jsx   # Customer booking history dashboard
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.jsx  # Admin overview and stats
│   │   │   │   ├── ManageBuses.jsx     # Add/edit/delete buses
│   │   │   │   ├── ManageRoutes.jsx    # Add/edit/delete routes
│   │   │   │   └── ManageUsers.jsx     # View and manage user accounts
│   │   │   ├── operator/
│   │   │   │   ├── OperatorDashboard.jsx  # Operator overview
│   │   │   │   ├── MyBuses.jsx            # View operator's assigned buses
│   │   │   │   └── PassengerList.jsx      # View passengers for a schedule
│   │   │   ├── LoginPage.jsx           # Shared login page
│   │   │   └── RegisterPage.jsx        # Shared registration page
│   │   ├── components/
│   │   │   ├── Navbar.jsx              # Top navigation bar
│   │   │   ├── ProtectedRoute.jsx      # Route guard for authenticated users
│   │   │   ├── SeatMap.jsx             # Interactive bus seat selection
│   │   │   ├── BusCard.jsx             # Bus info card for search results
│   │   │   └── BookingCard.jsx         # Booking summary card
│   │   ├── context/
│   │   │   └── AuthContext.jsx         # Global auth state (login, role, token)
│   │   ├── services/
│   │   │   ├── axios.js                # Axios instance with base URL and interceptors
│   │   │   ├── auth.service.js         # Auth API calls (login, register, logout)
│   │   │   ├── booking.service.js      # Booking API calls
│   │   │   ├── admin.service.js        # Admin API calls
│   │   │   └── operator.service.js     # Operator API calls
│   │   ├── utils/
│   │   │   └── helpers.js              # Shared utility/helper functions
│   │   ├── App.jsx                     # Root component with routing setup
│   │   └── main.jsx                    # Vite entry point, renders App
│   └── package.json                    # Frontend dependencies
│
├── .gitignore                          # Git ignore rules
└── README.md                           # Project documentation
```

## Getting Started

### Backend
```bash
cd backend
npm install
cp .env.example .env   # configure your environment variables
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables (backend/.env)
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/smartbusbooking
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
```
