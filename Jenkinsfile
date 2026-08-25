pipeline {
    agent any

    environment {
        COMPOSE_EXE = 'C:/Users/Hp/AppData/Local/Programs/DockerDesktop/resources/bin/docker-compose.exe'
        POSTGRES_HOST_PORT = '5438'
        SERVER_HOST_PORT = '8084'
        FRONTEND_HOST_PORT = '3003'
        E2E_BASE_URL = 'http://localhost:3003'
    }

    options {
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Backend Test') {
            steps {
                bat 'dotnet test .\\Login.Server.Tests\\Login.Server.Tests.csproj -c Release'
            }
        }

        stage('Frontend Build') {
            steps {
                dir('frontend') {
                    bat 'npm.cmd ci'
                    bat 'npm.cmd run build'
                }
            }
        }

        stage('Docker Deploy') {
            steps {
                bat '"%COMPOSE_EXE%" -p login-app down --remove-orphans'
                bat '"%COMPOSE_EXE%" -p login-app up --build -d'
            }
        }

        stage('Wait For Frontend') {
            steps {
                bat 'powershell.exe -NoProfile -Command "for ($i = 0; $i -lt 30; $i++) { try { Invoke-WebRequest -UseBasicParsing %E2E_BASE_URL% | Out-Null; exit 0 } catch { Start-Sleep -Seconds 2 } }; exit 1"'
            }
        }

        stage('E2E Test') {
            steps {
                dir('frontend') {
                    bat 'npx.cmd playwright install chromium'
                    bat 'npx.cmd playwright test --project=chromium'
                }
            }
        }
    }

    post {
        always {
            bat returnStatus: true, script: '"%COMPOSE_EXE%" -p login-app ps'
        }

        success {
            echo 'Login Pipeline completed successfully.'
        }

        failure {
            echo 'Login Pipeline failed.'
        }
    }
}
