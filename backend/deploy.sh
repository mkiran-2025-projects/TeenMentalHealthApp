#!/bin/bash
set -e

# Variables
# Use the same names you used when creating resources manually
STACK_NAME="MindCompanion"
BUCKET_NAME="mind-companion-deployment-mk"
S3_WEBSITE_BUCKET="mind-companion-website-mk"
AUDIO_BUCKET="mind-companion-audio-mk"
REGION="us-east-1"  # Or your preferred region

echo "Starting deployment of Teen Mental Health Chatbot..."

# Create S3 buckets if they don't exist
echo "Creating S3 buckets..."
aws s3 mb s3://$BUCKET_NAME --region $REGION || true
aws s3 mb s3://$S3_WEBSITE_BUCKET --region $REGION || true
aws s3 mb s3://$AUDIO_BUCKET --region $REGION || true

# Configure website bucket
echo "Configuring website bucket..."
aws s3 website s3://$S3_WEBSITE_BUCKET --index-document index.html --error-document index.html

# Package Lambda code
echo "Packaging Lambda code..."
mkdir -p build
cd build

# Create package.json for Lambda dependencies
cat > package.json << EOF
{
  "name": "teen-mental-health-chatbot",
  "version": "1.0.0",
  "description": "Lambda functions for Teen Mental Health Chatbot",
  "dependencies": {
    "aws-sdk": "^2.1048.0",
    "uuid": "^8.3.2",
    "node-fetch": "^2.6.7"
  }
}
EOF

# Install dependencies
npm install

# Create Lambda function files
echo "Creating Lambda function files..."

# Chatbot function
mkdir -p chatbot
cat > chatbot/index.js << 'EOF'
# Copy the full chatbot function code here
EOF

# Transcribe function
mkdir -p transcribe
cat > transcribe/index.js << 'EOF'
# Copy the full transcribe function code here
EOF

# Zip Lambda functions
echo "Zipping Lambda functions..."
cd chatbot
zip -r ../chatbot.zip .
cd ../transcribe
zip -r ../transcribe.zip .
cd ..

# Upload Lambda packages to S3
echo "Uploading Lambda packages to S3..."
aws s3 cp chatbot.zip s3://$BUCKET_NAME/chatbot.zip
aws s3 cp transcribe.zip s3://$BUCKET_NAME/transcribe.zip

# Update CloudFormation template
echo "Creating CloudFormation template..."
cat > template.yaml << 'EOF'
# Copy the full CloudFormation template here
EOF

# Update Lambda code locations in template

# Deploy CloudFormation stack
echo "Deploying CloudFormation stack..."
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket $BUCKET_NAME \
  --output-template-file packaged-template.yaml

aws cloudformation deploy \
  --template-file packaged-template.yaml \
  --stack-name $STACK_NAME \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AudioBucketName=$AUDIO_BUCKET \
    WebsiteBucketName=$S3_WEBSITE_BUCKET

# Get stack outputs
echo "Getting CloudFormation outputs..."
OUTPUTS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs' --output json)
API_ENDPOINT=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="ApiEndpoint") | .OutputValue')

# Update frontend with API endpoint
echo "Updating frontend with API endpoint..."
cd ..
sed -i "s|YOUR_API_GATEWAY_ENDPOINT|$API_ENDPOINT|g" index.html

# Upload frontend to S3
echo "Uploading frontend to S3..."
aws s3 cp index.html s3://$S3_WEBSITE_BUCKET/
aws s3 cp styles.css s3://$S3_WEBSITE_BUCKET/ || true
aws s3 cp script.js s3://$S3_WEBSITE_BUCKET/ || true

# Set public read permissions
aws s3api put-bucket-policy \
  --bucket $S3_WEBSITE_BUCKET \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::'$S3_WEBSITE_BUCKET'/*"
        }
    ]
}'

# Output website URL
WEBSITE_URL="http://$S3_WEBSITE_BUCKET.s3-website-$REGION.amazonaws.com"
echo "Deployment complete!"
echo "Website URL: $WEBSITE_URL"
echo "API Endpoint: $API_ENDPOINT"