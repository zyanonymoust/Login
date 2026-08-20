# Login Portal

A full-stack authentication system using React, ASP.NET Core, PostgreSQL and JWT.

## Features

- User registration
- User login
- JWT authentication
- Protected dashboard
- Dark mode
- Logout
- Backend tests
- Playwright E2E tests
- Docker deployment
- Jenkins CI/CD

## Tehnology Stack

- React
- TypeScript
- Vite
- ASP.NET Core
- Entity Framework Core
- PostgreSQL
- JWT
- Docker
- Jenkins
- Playwright
- xUnit

## Run with Aspire

'''powershell
dotnet run --project Login.AppHost
'''

Frontend:

'''text
http://localhost:3002
'''

## Run with Docker 

'''powershell
docker compose -p login-app up --build -d
'''

Frontend:

'''text
http://localhost:3002
'''

API:

'''text
http://localhost:8083
'''

Check containers:

'''powershell
docker compose -p login-app ps
'''

Stop Containers:

'''powershell
docker compose -p login-app down
'''

## Backend Tests

''''powershell
dotnet test .\Login.Server.Tests
'''

## Playwright Tests

'''powershell
cd frontend
npx.cmd playwright test --project=chromium
'''

## Jenkins Pipeline

The Jenkin pipeline automatically:

1. Checks out the source code
2. Runs backend tests
3. Builds the frontend
4. Builds and starts Docker containers
5. Waits for tthe frontend
6. Runs Playwright E2E tests

