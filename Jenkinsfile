pipeline {
	agent any

	stage{
		stage('Checkout'){
			steps {
				Checkout scm
			}
		}

		stage('Backend Test'){
			steps {
				bat '''
					dotnet test .\\Login.Server.Tests.csproj -c Release
				'''
			}
		}
	}

	stage('Frontend Build'){
		steps {
			dir('frontend'){
				bat '''
					call npm.cmd ci
					call npm.cmd run build
				'''
			}
		}
	}

	stage('Docker Deploy'){
		steps {
		bat '''
			docker compose down
			docker compose up --build -d
		'''
		}
	}

	stage('Wait For Frontend'){
		steps {
		 bats '''
			@echo off

			for /L %%i in (1,1,30) do (
				curl.exe -f http://localhost:3002 >nul  2>&1

				if not errorlevel 1 (
					exit /b 0
				)

				timeout /t 2 /nobreak >nul
			)

			exit /b 1

		'''

		}
	}

	stage('E2E Test'){
		steps {
			dir('frontend'){
				bat '''
					call npx.cmd playwright install chorium
					call npx.cmd playwright test --project=chorium
				'''
			}
		}
	}
}

post {
	always {
		bat '''
			docker compose ps
		'''
	}

	success{
		echo ''Login Pipeline completed successfully.'
	}

	failure {
		echo 'Login Pipeline failed.'
	}
}