pipeline {
    agent any
    environment {
        DEPLOY_DIR = "/opt/kiue"
    }
    stages {
        stage('Checkout') {
            steps { checkout scm }
        }
        stage('Build') {
            steps {
                sh "docker build -t kiue:${env.BRANCH_NAME}-${BUILD_NUMBER} -t kiue:${env.BRANCH_NAME}-latest ."
            }
        }
        stage('Deploy') {
            when { branch 'master' }
            steps {
                withCredentials([file(credentialsId: 'kiue-env', variable: 'ENV_FILE')]) {
                    // sobe a imagem construída no estágio Build: em DEPLOY_DIR só ficam o compose e o .env
                    // (sem código), então o compose não pode construir nada lá (--no-build)
                    sh """
                        cp \$ENV_FILE ${DEPLOY_DIR}/.env
                        cp docker-compose.yml ${DEPLOY_DIR}/docker-compose.yml
                        KIUE_IMAGE=kiue:${env.BRANCH_NAME}-${BUILD_NUMBER} docker compose -p kiue -f ${DEPLOY_DIR}/docker-compose.yml up -d --no-build --force-recreate
                    """
                }
            }
        }
    }
    post {
        success { echo "Kiuê #${BUILD_NUMBER} (${env.BRANCH_NAME}) OK" }
        failure { echo "Kiuê #${BUILD_NUMBER} (${env.BRANCH_NAME}) falhou" }
        cleanup { sh "docker image prune -f" }
    }
}
