# Enterprise Workforce Scheduling Engine

An AI-powered, full-stack scheduling application designed to solve complex operational bottlenecks. This engine replaces manual shift scheduling with a deterministic mathematical solver that guarantees baseline staffing compliance (e.g., dual-control opening procedures, vault coverage, and strictly enforced contract hours).

## 🚀 The Business Problem
Managing workforce schedules in highly regulated environments (like retail banking) requires balancing employee availability with strict security and operational constraints. Manual scheduling often leads to compliance risks and wasted managerial hours. 

This project solves that by translating human-language scheduling requests into mathematically optimized, conflict-free schedules in milliseconds.

## ✨ Key Features

* **Deterministic Math Engine:** Utilizes Google OR-Tools (C++) wrapped in Python to evaluate thousands of shift permutations and output mathematically optimal schedules.
* **NLP Constraint Injection:** Integrated a state-aware Natural Language Processing pipeline via the Gemini AI API. Users can type natural requests (e.g., "Give Sarah Saturday off"), which the AI parses into strict database rules before the math engine runs.
* **1-Click Sandbox Seeding:** Features a dedicated backend endpoint that instantly seeds a fully staffed dummy branch with staggered skills and contract hours, allowing users to test the optimization engine with zero manual data entry.
* **Role-Based Data Isolation:** Implemented strict Identity and Access Management (IAM) via Clerk. REST API endpoints validate session tokens to ensure strict multi-tenant data isolation.
* **Automated Reporting:** Includes client-side PDF generation to export formatted, weekly shift schedules.

## 🛠️ Architecture & Tech Stack

**Frontend:**
* React & Next.js (App Router)
* Tailwind CSS for responsive styling
* Clerk for secure Authentication & Session Management

**Backend:**
* FastAPI (Python) for asynchronous, high-performance API routing
* Google OR-Tools for constraint programming and schedule generation
* SQLAlchemy & SQLModel for ORM and database management
* Gemini API for Natural Language Processing

**Infrastructure:**
* PostgreSQL (Neon) for relational data storage
* Vercel (Frontend Deployment) & Render (Backend Containerization)

## 🔒 Security & Compliance Note
This application was engineered with a strict zero-trust mindset. **No proprietary data, live schedules, or Personally Identifiable Information (PII) is used or stored within this application.** All testing and demonstrations utilize 100% synthetic, locally generated data to ensure complete compliance with external deployment policies and Data Loss Prevention (DLP) best practices.

## 🌐 Live Application

**Experience the optimization engine live:** [aischeduler.typicaladrian.dev](https://aischeduler.typicaladrian.dev)

*(Note: To keep this portfolio project resource-efficient, the Python backend is hosted on a scaled-to-zero cloud container. If the branches or employees do not load immediately upon login, please allow ~50 seconds for the server to wake up from its "cold start" and establish the database connection.)*

### Getting Started on the Live Site:
1. Log in using the **Manager Login** button (secure authentication via Clerk).
2. Click the **"✨ Load 1-Click Demo Branch"** button to instantly seed the database with a pre-configured branch, employee roster, and sample AI constraints.
3. Click **"Generate Schedule"** to watch the deterministic solver build a mathematically compliant schedule in milliseconds.
