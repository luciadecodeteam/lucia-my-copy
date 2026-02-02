#!/bin/bash

# This script deploys the create-cache-lambda function to AWS.
#
# IMPORTANT:
# 1. You must have the AWS CLI installed and configured.
# 2. You must have zip installed.
# 3. Replace the IAM_ROLE_ARN with the correct ARN for your Lambda execution role.

# --- Configuration ---
LAMBDA_FUNCTION_NAME="temp-create-vertex-cache"
# This is a placeholder. Replace with the ARN of the IAM role that your Lambda will use.
# It should have basic Lambda execution permissions (CloudWatch Logs)
# and any other permissions required for your specific AWS environment.
IAM_ROLE_ARN="arn:aws:iam::406682759576:role/lucia-gcp-federation-role"

REGION="eu-west-1" # Or your desired region
# ---

# 1. Install dependencies
echo "Installing dependencies..."
npm install

# 2. Create deployment package
echo "Creating deployment package..."
zip -r deployment.zip index.js gcp-wif-aws.json node_modules

# 3. Create Lambda function
echo "Creating Lambda function..."
aws lambda create-function \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --runtime nodejs20.x \
  --role "$IAM_ROLE_ARN" \
  --handler index.handler \
  --zip-file fileb://deployment.zip \
  --region "$REGION" \
  --timeout 30

echo "Waiting for Lambda function to be created..."
aws lambda wait function-active-v2 --function-name "$LAMBDA_FUNCTION_NAME" --region "$REGION"

# 4. Invoke Lambda function
echo "Invoking Lambda function..."
aws lambda invoke \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  --region "$REGION" \
  response.json

echo "Lambda function invoked. See response.json for the output."
echo "The cache ID is in the 'body' of the response."

# 5. Clean up
read -p "Do you want to delete the Lambda function and the deployment package? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
  echo "Deleting Lambda function..."
  aws lambda delete-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$REGION"
  echo "Deleting deployment package..."
  rm deployment.zip
  rm response.json
  echo "Clean up complete."
fi
