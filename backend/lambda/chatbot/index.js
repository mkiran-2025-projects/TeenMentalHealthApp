const AWS = require('aws-sdk');
const comprehend = new AWS.Comprehend();
const polly = new AWS.Polly();
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const bedrock = new AWS.BedrockRuntime();
const { v4: uuidv4 } = require('uuid');
const crisisModule = require('./crisis');

// Environment variables
// In chatbot/index.js
const CONVERSATION_TABLE = process.env.CONVERSATION_TABLE || 'MindCompanionConversations';
const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME || 'mind-companion-audio-mk';
const TTL_DAYS = 30; // Store conversations for 30 days

exports.handler = async (event) => {
    try {
        // Parse the incoming request
        const requestBody = JSON.parse(event.body);
        const userMessage = requestBody.message;
        const sessionId = requestBody.sessionId || 'anonymous';
        const useVoice = requestBody.useVoice || false;
        
        // Input validation
        if (!userMessage) {
            return formatResponse(400, { error: 'Missing message' });
        }
        
        // Perform sentiment analysis
        const sentimentResult = await comprehend.detectSentiment({
            Text: userMessage,
            LanguageCode: 'en'
        }).promise();
        
        // Store the message in DynamoDB
        const timestamp = Date.now();
        await dynamoDB.put({
            TableName: CONVERSATION_TABLE,
            Item: {
                sessionId,
                timestamp,
                message: userMessage,
                role: 'user',
                sentiment: sentimentResult.Sentiment,
                sentimentScores: sentimentResult.SentimentScore,
                ttl: Math.floor(Date.now() / 1000) + (TTL_DAYS * 24 * 60 * 60)
            }
        }).promise();
        
        // Get conversation history (last 10 messages)
        const conversationHistory = await dynamoDB.query({
            TableName: CONVERSATION_TABLE,
            KeyConditionExpression: 'sessionId = :sid',
            ExpressionAttributeValues: {
                ':sid': sessionId
            },
            Limit: 20,
            ScanIndexForward: false // Get most recent messages first
        }).promise();
        
        // Format conversation history for the LLM
        const formattedHistory = conversationHistory.Items
            .sort((a, b) => a.timestamp - b.timestamp) // Sort by timestamp ascending
            .map(item => ({
                role: item.role,
                content: item.message
            }));
        
        // Prepare LLM prompt with mental health focus
        const systemMessage = {
            role: 'system',
            content: `You are a supportive, compassionate mental health companion for teenagers. 
                     Your name is Mind Companion. Your purpose is to provide a safe space for teens to express themselves
                     and receive support. You are not a replacement for professional mental health services, but you can:
                     
                     1. Listen empathetically without judgment
                     2. Ask thoughtful questions to help teens explore their feelings
                     3. Provide evidence-based coping techniques when appropriate
                     4. Recognize signs of crisis and suggest appropriate resources
                     5. Maintain a positive, hopeful tone while acknowledging challenges
                     
                     IMPORTANT: If you detect signs of self-harm, suicidal ideation, abuse, or other crisis situations,
                     gently suggest professional resources such as:
                     - Crisis Text Line: Text HOME to 741741
                     - National Suicide Prevention Lifeline: 988
                     - Encourage talking to a trusted adult, school counselor, or therapist
                     
                     Remember that teens face unique challenges. Be respectful of their experiences and never dismiss
                     their concerns as "just a phase." Use accessible language and avoid clinical jargon.
                     
                     Current detected sentiment: ${sentimentResult.Sentiment} (${Object.entries(sentimentResult.SentimentScore)
                     .map(([key, value]) => `${key}: ${value.toFixed(2)}`).join(', ')})`
        };
        
        // Use Amazon Bedrock to generate a response with Claude or other LLM
        const promptMessages = [systemMessage, ...formattedHistory, { role: 'user', content: userMessage }];
        
        const bedrockResponse = await bedrock.invokeModel({
            modelId: 'anthropic.claude-3-haiku-20240307-v1:0', // Or your chosen model
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 1000,
                messages: promptMessages
            })
        }).promise();
        
        // Parse the response
        const responseBody = JSON.parse(Buffer.from(bedrockResponse.body).toString('utf8'));
        const botMessage = responseBody.content[0].text;
        
        // Store the bot response in DynamoDB
        await dynamoDB.put({
            TableName: CONVERSATION_TABLE,
            Item: {
                sessionId,
                timestamp: timestamp + 1, // Ensure ordering
                message: botMessage,
                role: 'assistant',
                ttl: Math.floor(Date.now() / 1000) + (TTL_DAYS * 24 * 60 * 60)
            }
        }).promise();
        
        // Generate voice response if requested
        let audioUrl = null;
        if (useVoice) {
            // Use Amazon Polly to convert text to speech
            const pollyParams = {
                Engine: 'neural',
                LanguageCode: 'en-US',
                OutputFormat: 'mp3',
                Text: botMessage,
                TextType: 'text',
                VoiceId: 'Matthew' // Choose an appropriate voice
            };
            
            const pollyResponse = await polly.synthesizeSpeech(pollyParams).promise();
            
            // Save audio to S3
            const audioKey = `${sessionId}/audio/${uuidv4()}.mp3`;
            await s3.putObject({
                Bucket: AUDIO_BUCKET_NAME,
                Key: audioKey,
                Body: pollyResponse.AudioStream,
                ContentType: 'audio/mpeg'
            }).promise();
            
            // Generate a pre-signed URL for the audio file (valid for 5 minutes)
            audioUrl = s3.getSignedUrl('getObject', {
                Bucket: AUDIO_BUCKET_NAME,
                Key: audioKey,
                Expires: 300,

                Bucket: AUDIO_BUCKET_NAME,
                Key: audioKey,
                Expires: 300 // URL valid for 5 minutes
            });
        }
        
        // Return the response
        return formatResponse(200, {
            message: botMessage,
            audioUrl: audioUrl,
            sentiment: sentimentResult.Sentiment,
            sentimentScores: sentimentResult.SentimentScore
        });
    } catch (error) {
        console.error('Error processing message:', error);
        return formatResponse(500, { error: 'Failed to process message' });
    }
};

// Helper function to format API response
function formatResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(body)
    };
}