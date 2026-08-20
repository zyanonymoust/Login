pipeline {
    agent any

    environment {
        DOCKER_EXE = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
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
                bat '"%DOCKER_EXE%" compose down'
                bat '"%DOCKER_EXE%" compose up --build -d'
            }
        }

        stage('Wait For Frontend') {
            steps {
                bat 'powershell.exe -NoProfile -Command "for ($i = 0; $i -lt 30; $i++) { try { Invoke-WebRequest -UseBasicParsing http://localhost:3002 | Out-Null; exit 0 } catch { Start-Sleep -Seconds 2 } }; exit 1"'
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
            bat returnStatus: true, script: '"%DOCKER_EXE%" compose ps'
        }

        success {
            echo 'Login Pipeline completed successfully.'
        }

        failure {
            echo 'Login Pipeline failed.'
        }
    }
}