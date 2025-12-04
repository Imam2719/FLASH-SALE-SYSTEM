# 🚀 Flash Sale Stock Reservation System

A full-stack e-commerce application where users can reserve products for **2 minutes** with automatic stock restoration and concurrent user handling.

**Tech Stack:**
- Backend: NestJS + PostgreSQL + Redis (Bull Queue)
- Frontend: Next.js 16 + React 19 + Tailwind CSS
- Database: PostgreSQL
- Job Queue: Bull Queue (Redis)

---

## 📋 Table of Contents
1. [Features](#features)
2. [System Architecture](#system-architecture)
3. [Setup Instructions](#setup-instructions)
4. [Environment Variables](#environment-variables)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [How Expiration Works](#how-expiration-works)
8. [Concurrency Handling](#concurrency-handling)
9. [Trade-offs & Limitations](#trade-offs--limitations)
10. [Troubleshooting](#troubleshooting)

---

## ✨ Features

✅ **Reserve Products** - Users can reserve items for 2 minutes
✅ **Automatic Expiration** - Reservations expire automatically without user action
✅ **Stock Management** - Stock is deducted on reservation, restored on expiration
✅ **Concurrent Users** - Multiple users can reserve simultaneously without stock going negative
✅ **Timer Persistence** - Countdown timer survives page refreshes
✅ **Real-time Updates** - UI syncs with backend every second
✅ **Background Jobs** - Automatic expiration via Bull Queue + Cron fallback
✅ **Mock Payment** - Complete purchases without real payment processing
✅ **Reservation History** - Track all reservations (active, completed, expired)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
│                   (Next.js + React + Tailwind)              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ProductList Component                               │  │
│  │  - Displays all products with stock                  │  │
│  │  - Auto-refreshes every 1 second                     │  │
│  │  - Shows active reservations with timers             │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ReservationTimer Component                          │  │
│  │  - 2-minute countdown                                │  │
│  │  - Persists timer on page refresh (localStorage)     │  │
│  │  - Syncs with backend                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                         ↓ HTTP (REST API)
                         ↑
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND API                             │
│                    (NestJS on Port 3001)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Reservations Controller                             │  │
│  │  POST   /reservations          (create)             │  │
│  │  POST   /reservations/:id/complete (complete)       │  │
│  │  GET    /reservations          (list all)           │  │
│  │  GET    /reservations/:id      (get one)            │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Reservations Service                                │  │
│  │  - Stock validation with DB locking                 │  │
│  │  - Transaction management                           │  │
│  │  - Queue job scheduling                             │  │
│  │  - Background expiration logic                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Products Controller & Service                       │  │
│  │  - Stock management (increment/decrement)           │  │
│  │  - Product listing                                   │  │
│  │  - Sample data seeding                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Reservations Processor (Bull Queue)                │  │
│  │  - Processes expire-reservation jobs                │  │
│  │  - Retry logic (3 attempts with backoff)           │  │
│  │  - Error handling                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Scheduled Jobs (NestJS @Cron)                      │  │
│  │  - Every 10 seconds: Check for expired              │  │
│  │  - Fallback for missed Bull jobs                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         ↓ TypeORM                    ↓ Bull Queue
         ↑                             ↑
┌─────────────────────────┐  ┌──────────────────────┐
│   PostgreSQL Database   │  │   Redis (Queue)      │
│                         │  │                      │
│ products table          │  │ - Scheduled jobs     │
│ reservations table      │  │ - Job persistence    │
│ (with transactions)     │  │ - Auto-retry         │
└─────────────────────────┘  └──────────────────────┘
```

---

## 🔒 How Expiration Works

### Dual Mechanism (Primary + Fallback):

#### 1️⃣ **Primary: Bull Queue + Redis** (Immediate)
```
Timeline:
T=0:00    → User creates reservation with 2-minute timer
T=0:00    → Bull Queue schedules 'expire-reservation' job (delay: 120s)
T=2:00    → Job executes: mark as EXPIRED + restore stock
T=2:01    → User sees reservation expired when they check
```

**Advantages:**
- ✅ Immediate execution at exact 2-minute mark
- ✅ Survives server restarts (Redis persists jobs)
- ✅ Scales to thousands of concurrent reservations
- ✅ No database load during processing

#### 2️⃣ **Fallback: Cron Job** (Safety Net)
```
Every 10 seconds:
1. Query database for ACTIVE reservations where expiresAt < NOW()
2. For each expired: mark as EXPIRED + restore stock
3. Log the action
```

**Advantages:**
- ✅ Catches jobs that Bull Queue missed
- ✅ Works even if Redis goes down
- ✅ Catches jobs scheduled before server restart
- ✅ Idempotent (safe to run multiple times)

### Why Both?
- **Bull Queue**: Fast & efficient for normal operation
- **Cron Job**: Catches edge cases and failures
- **Together**: Guaranteed expiration even in failure scenarios

---

## 🔐 Concurrency Handling

### Problem: Race Condition
```
UNSAFE CODE (stock can go negative):
├─ User A: Check stock (5 available) ✓
├─ User B: Check stock (5 available) ✓
├─ User A: Reserve 5 (stock = 0)
├─ User B: Reserve 5 (stock = -5) ❌ NEGATIVE!
└─ Result: Overselling!
```

### Solution: Pessimistic Database Locking

```typescript
// 🔒 Lock the row at database level
const product = await queryRunner.manager
  .createQueryBuilder()
  .select('product')
  .from('products', 'product')
  .where('product.id = :id', { id: productId })
  .setLock('pessimistic_write')  // ← Only ONE query can access at a time
  .getOne();

// Check & Deduct (now atomic)
if (product.availableStock < quantity) {
  throw new Error('Insufficient stock');
}

// Deduct stock (protected by lock)
await updateStock(productId, -quantity);
```

### Why This Works:
```
SAFE CODE (with locking):
├─ User A: LOCK product row (stock=5)
├─ User B: WAIT for lock to be released
├─ User A: Check (5 available) ✓
├─ User A: Reserve 5 (stock = 0)
├─ User A: RELEASE lock
├─ User B: ACQUIRE lock (stock=0)
├─ User B: Check (0 available) ✗
├─ User B: Throw error "Insufficient stock"
└─ Result: Stock never goes negative! ✅
```

### Transaction Flow:
```
1. START TRANSACTION
2. LOCK product row for update (pessimistic_write)
3. Read product.availableStock
4. Validate quantity <= availableStock
5. Deduct stock atomically
6. Create reservation record
7. COMMIT TRANSACTION
8. Schedule Bull job (outside transaction)
```

---

## 💾 Database Schema

### Products Table
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  availableStock INTEGER NOT NULL,
  totalStock INTEGER NOT NULL
);
```

### Reservations Table
```sql
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  productId UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  status ENUM('ACTIVE', 'COMPLETED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt TIMESTAMP NOT NULL
);

-- Index for quick lookup of expired reservations
CREATE INDEX idx_reservations_status_expires 
ON reservations(status, expiresAt) 
WHERE status = 'ACTIVE';
```

### Sample Data
```sql
INSERT INTO products (name, price, availableStock, totalStock) VALUES
('iPhone 15 Pro Max', 1199, 10, 10),
('Samsung Galaxy S24 Ultra', 1099, 15, 15),
('MacBook Air M3', 1299, 8, 8),
('Sony WH-1000XM5 Headphones', 399, 20, 20),
('iPad Pro 12.9"', 1099, 12, 12),
('AirPods Pro (2nd Gen)', 249, 25, 25);
```

---

## 🔌 API Endpoints

### GET /products
**Get all products with current stock**
```bash
curl http://localhost:3001/products
```

Response:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "iPhone 15 Pro Max",
    "price": 1199,
    "availableStock": 10,
    "totalStock": 10
  }
]
```

### POST /reservations
**Create a new reservation**
```bash
curl -X POST http://localhost:3001/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "550e8400-e29b-41d4-a716-446655440000",
    "quantity": 1
  }'
```

Response:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "productId": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 1,
  "status": "ACTIVE",
  "createdAt": "2025-04-12T10:30:00Z",
  "expiresAt": "2025-04-12T10:32:00Z"
}
```

### POST /reservations/:id/complete
**Complete a reservation (mock payment)**
```bash
curl -X POST http://localhost:3001/reservations/660e8400-e29b-41d4-a716-446655440001/complete
```

Response:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "productId": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 1,
  "status": "COMPLETED",
  "createdAt": "2025-04-12T10:30:00Z",
  "expiresAt": "2025-04-12T10:32:00Z"
}
```

### GET /reservations
**Get all reservations**
```bash
curl http://localhost:3001/reservations
```

### GET /reservations/:id
**Get specific reservation**
```bash
curl http://localhost:3001/reservations/660e8400-e29b-41d4-a716-446655440001
```

---

## 📦 Setup Instructions

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (recommended)
- npm or yarn

### Step 1: Install Redis Package (CRITICAL)
Navigate to **backend** folder and install Redis:

```bash
cd backend
npm install redis ioredis
```

**Output should show:**
```
added 50 packages in 5s
```

### Step 2: Install Dependencies

#### Backend
```bash
cd backend
npm install
```

#### Frontend
```bash
cd frontend
npm install
```

### Step 3: Setup PostgreSQL & Redis

#### Option A: Using Docker (Recommended)
```bash
# Start PostgreSQL
docker run --name flashsale-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=Imam9755 \
  -e POSTGRES_DB=flashsale \
  -p 5432:5432 \
  -d postgres:16

# Start Redis
docker run --name flashsale-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

#### Option B: Using Docker Compose
Create `docker-compose.yml` in project root:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: Imam9755
      POSTGRES_DB: flashsale
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

Then run:
```bash
docker-compose up -d
```

### Step 4: Configure Environment Variables

#### Backend: `.env` file
```bash
cd backend

# Copy example to .env
cp .env .env

# Edit .env with your values
nano .env
```

Content:
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=Imam9755
DATABASE_NAME=flashsale
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3001
NODE_ENV=development
```

#### Frontend: Create `.env.local`
```bash
cd frontend

# Create .env.local
touch .env.local
```

Content:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Step 5: Run Backend

```bash
cd backend
npm run start:dev
```

**Expected output:**
```
🚀 ================================
✅ Backend running on: http://localhost:3001
🗄️  Database: PostgreSQL (flashsale)
📦 Redis: localhost:6379
================================
```

### Step 6: Run Frontend

**In a new terminal:**
```bash
cd frontend
npm run dev
```

**Expected output:**
```
  ▲ Next.js 16.0.7
  - Local:        http://localhost:3000
```

### Step 7: Seed Sample Data

Data is automatically seeded when backend starts!

Visit: `http://localhost:3000`

---

## 🌍 Environment Variables

### Backend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_USER` | PostgreSQL username | `postgres` |
| `DATABASE_PASSWORD` | PostgreSQL password | `Imam9755` |
| `DATABASE_NAME` | Database name | `flashsale` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PORT` | Backend API port | `3001` |
| `NODE_ENV` | Environment | `development` |

### Frontend (.env.local)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:3001` |

---

## 📊 Trade-offs & Limitations

### Trade-offs Made

#### ✅ Pessimistic Locking vs Optimistic Concurrency
**Choice:** Pessimistic (database-level locks)

**Pros:**
- ✅ Guarantees no race conditions
- ✅ Simple to implement and understand
- ✅ Perfect for flash sales (less likely concurrent access to same product)

**Cons:**
- ❌ Slightly lower throughput (users wait for lock)
- ❌ Potential deadlocks under extreme load

**Alternative:** Optimistic with version numbers (more complex, higher throughput)

---

#### ✅ Bull Queue + Cron vs Only Cron
**Choice:** Dual mechanism

**Pros:**
- ✅ Fast primary expiration (Bull Queue)
- ✅ Reliable fallback (Cron)
- ✅ Survives Redis/server failures
- ✅ Guaranteed expiration

**Cons:**
- ❌ More complex to maintain
- ❌ Double-processing edge case (mitigated by idempotent check)

**Simpler Alternative:** Only Cron (but slower - 10 second delay)

---

#### ✅ 2-Minute Expiration
**Choice:** Fixed 2 minutes

**Pros:**
- ✅ Simple to implement
- ✅ Standard for flash sales
- ✅ Predictable for users

**Cons:**
- ❌ Not configurable per product
- ❌ Strict timing (no extensions)

**Alternative:** Variable expiration based on product/user (more complex)

---

### Limitations

| Limitation | Current | Possible Solution |
|-----------|---------|------------------|
| **Max concurrent users** | ~1000 with single server | Add load balancer + multiple instances |
| **Database scalability** | Single PostgreSQL | Database replication, read replicas |
| **Redis persistence** | In-memory (lost on restart) | AOF/RDB persistence enabled |
| **No real payment** | Mock only | Integrate Stripe/PayPal |
| **No user authentication** | Any user can reserve | JWT/OAuth implementation |
| **No inventory sync** | Manual | Real-time sync with external systems |
| **No audit logging** | Basic console logs | Winston/Pino logging |
| **Single deployment** | Local only | Docker/Kubernetes deployment |

---

## 🐛 Troubleshooting

### Issue: "Request timeout"
**Cause:** Backend not running

**Solution:**
```bash
cd backend
npm run start:dev

# Verify: http://localhost:3001/products should return 200
```

---

### Issue: "Cannot connect to database"
**Cause:** PostgreSQL not running

**Solution:**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Start if not running
docker run --name flashsale-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=Imam9755 \
  -e POSTGRES_DB=flashsale \
  -p 5432:5432 \
  -d postgres:16
```

---

### Issue: "Redis connection failed"
**Cause:** Redis not running

**Solution:**
```bash
# Check if Redis is running
docker ps | grep redis

# Start if not running
docker run --name flashsale-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

---

### Issue: "Stock went negative"
**Cause:** Race condition (shouldn't happen with latest code)

**Solution:**
1. Update to latest `reservations.service.ts`
2. Verify using pessimistic locking
3. Test with concurrent requests

---

### Issue: "Reservations not expiring"
**Cause:** Bull Queue or Cron job not working

**Solution:**
```bash
# Check backend logs
# Should see: "✅ Reservation X created - expires at..."
# After 2 mins: "⏰ Reservation X expired"

# If not:
1. Verify Redis is running
2. Check .env REDIS_HOST and REDIS_PORT
3. Check backend logs for errors
```

---

### Issue: "Timer not syncing"
**Cause:** Frontend refresh rate too slow or backend time skewed

**Solution:**
```bash
# In ProductList.tsx, change refresh rate:
setInterval(fetchData, 1000);  // 1 second (was 5000)
```

---

## 📝 Testing Checklist

Run through these before submission:

- [ ] Backend starts without errors
- [ ] Frontend loads products
- [ ] Can create reservation
- [ ] Timer counts down
- [ ] Timer survives page refresh
- [ ] Can complete purchase within 2 minutes
- [ ] Reservation expires after 2 minutes
- [ ] Stock automatically restored after expiration
- [ ] Two users reserving same product: one succeeds, one gets "Insufficient stock"
- [ ] History shows all reservations (ACTIVE, COMPLETED, EXPIRED)
- [ ] All API endpoints return correct data

---

## 📚 Project Structure

```
FLASH-SALE-SYSTEM/
├── backend/
│   ├── src/
│   │   ├── products/
│   │   │   ├── entities/
│   │   │   │   └── product.entity.ts
│   │   │   ├── products.controller.ts
│   │   │   ├── products.service.ts
│   │   │   └── products.module.ts
│   │   ├── reservations/
│   │   │   ├── dto/
│   │   │   │   └── create-reservation.dto.ts
│   │   │   ├── entities/
│   │   │   │   └── reservation.entity.ts
│   │   │   ├── reservations.controller.ts
│   │   │   ├── reservations.service.ts
│   │   │   ├── reservations.processor.ts
│   │   │   └── reservations.module.ts
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/
│   │   ├── components/
│   │   │   ├── ProductCard.tsx
│   │   │   ├── ProductList.tsx
│   │   │   └── ReservationTimer.tsx
│   │   ├── lib/
│   │   │   └── api.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── .env.local
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
└── README.md
```

---

## 🎯 Key Features Summary

| Feature | How It Works |
|---------|------------|
| **Reserve for 2 minutes** | expiresAt = now + 120 seconds |
| **Auto expiration** | Bull Queue job + Cron fallback |
| **No overselling** | Pessimistic database locking |
| **Stock restoration** | Auto-increment on expiration |
| **Timer persistence** | localStorage + backend sync |
| **Concurrent support** | Database transactions + locking |
| **Background jobs** | No client polling |
| **Server restart safe** | Redis persists jobs |

---

## 📞 Support

If you encounter issues:

1. Check logs: `npm run start:dev`
2. Verify .env files
3. Ensure PostgreSQL & Redis running
4. Check ports: 3000 (frontend), 3001 (backend), 5432 (postgres), 6379 (redis)
5. Read troubleshooting section above

---

BEFORE                          AFTER
├─ Light theme                  ├─ Dark theme 🌙
├─ 5 second refresh             ├─ 1 second refresh ⚡
├─ Basic layout                 ├─ Professional layout
├─ Gray cards                   ├─ Gradient cards
├─ Simple colors                ├─ Modern gradients
└─ Limited animations           └─ Rich animations

## 📄 License

UNLICENSED - Private Project

---

**Last Updated:** April 2025
**Version:** 1.0.0
