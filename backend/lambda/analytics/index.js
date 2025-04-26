const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        // Get time range from query parameters (default to last 24 hours)
        const queryParams = event.queryStringParameters || {};
        const startTime = parseInt(queryParams.startTime) || Date.now() - (24 * 60 * 60 * 1000);
        const endTime = parseInt(queryParams.endTime) || Date.now();
        
        // Get all conversations within time range
        const conversations = await getAllConversations(startTime, endTime);
        
        // Analyze conversations
        const analytics = analyzeConversations(conversations);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(analytics)
        };
    } catch (error) {
        console.error('Error generating analytics:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Failed to generate analytics' })
        };
    }
};

// Get all conversations from DynamoDB
async function getAllConversations(startTime, endTime) {
    // This is a simplified implementation
    // For production, you'd need to handle pagination
    const params = {
        TableName: process.env.CONVERSATION_TABLE || 'TeenMentalHealthConversations',
        FilterExpression: 'timestamp BETWEEN :start AND :end',
        ExpressionAttributeValues: {
            ':start': startTime,
            ':end': endTime
        }
    };
    
    const result = await dynamoDB.scan(params).promise();
    return result.Items;
}

// Analyze conversations to extract insights
function analyzeConversations(conversations) {
    // Group by session
    const sessionMap = new Map();
    conversations.forEach(item => {
        if (!sessionMap.has(item.sessionId)) {
            sessionMap.set(item.sessionId, []);
        }
        sessionMap.get(item.sessionId).push(item);
    });
    
    // Extract metrics
    const uniqueSessions = sessionMap.size;
    const totalMessages = conversations.length;
    const userMessages = conversations.filter(item => item.role === 'user').length;
    const botMessages = conversations.filter(item => item.role === 'assistant').length;
    
    // Sentiment analysis
    const sentiments = conversations
        .filter(item => item.sentiment)
        .map(item => ({
            sentiment: item.sentiment,
            scores: item.sentimentScores
        }));
    
    const sentimentCounts = {
        POSITIVE: sentiments.filter(s => s.sentiment === 'POSITIVE').length,
        NEUTRAL: sentiments.filter(s => s.sentiment === 'NEUTRAL').length,
        NEGATIVE: sentiments.filter(s => s.sentiment === 'NEGATIVE').length,
        MIXED: sentiments.filter(s => s.sentiment === 'MIXED').length
    };
    
    // Average sentiment scores
    const avgScores = sentiments.reduce((acc, curr) => {
        Object.keys(curr.scores || {}).forEach(key => {
            if (!acc[key]) acc[key] = 0;
            acc[key] += curr.scores[key];
        });
        return acc;
    }, {});
    
    Object.keys(avgScores).forEach(key => {
        avgScores[key] = avgScores[key] / sentiments.length;
    });
    
    // Session length analysis
    const sessionLengths = Array.from(sessionMap.entries()).map(([_, messages]) => messages.length);
    const avgSessionLength = sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length;
    
    return {
        timeRange: {
            start: new Date(Math.min(...conversations.map(item => item.timestamp))).toISOString(),
            end: new Date(Math.max(...conversations.map(item => item.timestamp))).toISOString()
        },
        metrics: {
            uniqueSessions,
            totalMessages,
            userMessages,
            botMessages,
            avgMessagesPerSession: avgSessionLength
        },
        sentiment: {
            counts: sentimentCounts,
            averageScores: avgScores
        }
    };
}