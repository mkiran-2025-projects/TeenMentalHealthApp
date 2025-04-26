// This module can be incorporated into your chatbot Lambda function

// List of crisis keywords to monitor
const CRISIS_KEYWORDS = [
    'suicide', 'kill myself', 'end my life', 'don\'t want to live', 
    'hurt myself', 'self harm', 'cutting', 'harm myself',
    'want to die', 'better off dead', 'no reason to live',
    'abuse', 'hitting me', 'hurting me', 'unsafe'
];

// Crisis detection logic
function detectCrisis(text) {
    const lowercaseText = text.toLowerCase();
    
    // Check for crisis keywords
    const foundKeywords = CRISIS_KEYWORDS.filter(keyword => 
        lowercaseText.includes(keyword)
    );
    
    if (foundKeywords.length > 0) {
        return {
            isCrisis: true,
            severity: calculateSeverity(foundKeywords, lowercaseText),
            keywords: foundKeywords
        };
    }
    
    return { isCrisis: false };
}

// Calculate severity based on keyword frequency and context
function calculateSeverity(keywords, text) {
    // This is a simplified implementation
    // A more advanced implementation would use NLP and context analysis
    if (keywords.some(k => k.includes('suicide') || k.includes('kill'))) {
        return 'high';
    } else if (keywords.some(k => k.includes('harm') || k.includes('hurt'))) {
        return 'medium';
    } else {
        return 'low';
    }
}

// Get appropriate resources based on crisis type
function getCrisisResources(crisisInfo) {
    const resources = {
        general: [
            {
                name: "Crisis Text Line",
                description: "Text HOME to 741741 to connect with a Crisis Counselor",
                contact: "741741"
            },
            {
                name: "988 Suicide & Crisis Lifeline",
                description: "Call or text 988 to connect with a trained crisis counselor",
                contact: "988"
            }
        ],
        suicide: [
            {
                name: "National Suicide Prevention Lifeline",
                description: "Call 988 for 24/7 support",
                contact: "988"
            },
            {
                name: "Trevor Project (LGBTQ+)",
                description: "Call 1-866-488-7386 for 24/7 support",
                contact: "1-866-488-7386"
            }
        ],
        selfHarm: [
            {
                name: "Self-harm Crisis Text Line",
                description: "Text HOME to 741741",
                contact: "741741"
            }
        ],
        abuse: [
            {
                name: "National Child Abuse Hotline",
                description: "Call 1-800-4-A-CHILD (1-800-422-4453)",
                contact: "1-800-422-4453"
            },
            {
                name: "Childhelp National Child Abuse Hotline",
                description: "Call 1-800-422-4453 for 24/7 support",
                contact: "1-800-422-4453"
            }
        ]
    };
    
    // Determine which resources to return based on detected keywords
    if (!crisisInfo.isCrisis) {
        return [];
    }
    
    const relevantResources = [...resources.general];
    
    const keywords = crisisInfo.keywords.join(' ');
    if (keywords.includes('suicide') || keywords.includes('kill') || keywords.includes('die')) {
        relevantResources.push(...resources.suicide);
    }
    
    if (keywords.includes('harm') || keywords.includes('hurt') || keywords.includes('cutting')) {
        relevantResources.push(...resources.selfHarm);
    }
    
    if (keywords.includes('abuse') || keywords.includes('hitting') || keywords.includes('unsafe')) {
        relevantResources.push(...resources.abuse);
    }
    
    return relevantResources;
}

// Format crisis response for the chatbot
function formatCrisisResponse(crisisInfo) {
    if (!crisisInfo.isCrisis) {
        return null;
    }
    
    const resources = getCrisisResources(crisisInfo);
    
    let response = "I'm concerned about what you've shared. ";
    
    if (crisisInfo.severity === 'high') {
        response += "It sounds like you're going through something really difficult right now. Your safety is important, and there are people who can help immediately. ";
    } else {
        response += "It sounds like you're facing some challenges. It's brave of you to share this, and there are resources that can help. ";
    }
    
    response += "Here are some resources that might be helpful:\n\n";
    
    resources.forEach(resource => {
        response += `- ${resource.name}: ${resource.description} (${resource.contact})\n`;
    });
    
    response += "\nDo you feel comfortable reaching out to any of these resources? Would you like me to provide any additional information about them?";
    
    return response;
}

// Export functions for use in the main Lambda handler
module.exports = {
    detectCrisis,
    getCrisisResources,
    formatCrisisResponse
};