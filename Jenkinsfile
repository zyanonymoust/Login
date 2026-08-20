pipeline {
    agent any

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
                bat 'C:\User\Hp\AppData\Local\Programs\DockerDestop\resources\bin\docker'
                bat 'C:\User\Hp\AppData\Local\Programs\DockerDestop\resources\bin\docker.exe'
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
            bat 'C:\User\Hp\AppData\Local\Programs\DockerDestop\resources\bin\docker'
        }

        success {
            echo "Login Pipeline completed successfully."
        }

        failure {
            echo "Login Pipeline failed."
        }
    }
}