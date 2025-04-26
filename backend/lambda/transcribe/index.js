const AWS = require('aws-sdk');
const transcribe = new AWS.TranscribeService();
const s3 = new AWS.S3();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
    try {
        // Parse the incoming request
        const requestBody = JSON.parse(event.body);
        const audioData = requestBody.audio;
        const sessionId = requestBody.sessionId || 'anonymous';
        
        // Input validation
        if (!audioData) {
            return formatResponse(400, { error: 'Missing audio data' });
        }
        
        // Convert base64 to buffer
        const buffer = Buffer.from(audioData, 'base64');
        
        // Generate a unique filename
        const filename = `${sessionId}/${uuidv4()}.wav`;
        
        // Upload to S3
        const bucketName = process.env.AUDIO_BUCKET_NAME;
        await s3.putObject({
            Bucket: bucketName,
            Key: filename,
            Body: buffer,
            ContentType: 'audio/wav'
        }).promise();
        
        // Start transcription job
        const transcriptionJobName = `transcribe-${uuidv4()}`;
        const s3Uri = `s3://${bucketName}/${filename}`;
        
        await transcribe.startTranscriptionJob({
            TranscriptionJobName: transcriptionJobName,
            Media: { MediaFileUri: s3Uri },
            MediaFormat: 'wav',
            LanguageCode: 'en-US',
            OutputBucketName: bucketName,
            OutputKey: `${sessionId}/transcriptions/${transcriptionJobName}.json`
        }).promise();
        
        // Wait for transcription to complete
        let transcriptionJob;
        do {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            transcriptionJob = await transcribe.getTranscriptionJob({
                TranscriptionJobName: transcriptionJobName
            }).promise();
        } while (transcriptionJob.TranscriptionJob.TranscriptionJobStatus === 'IN_PROGRESS');
        
        // Check if job completed successfully
        if (transcriptionJob.TranscriptionJob.TranscriptionJobStatus !== 'COMPLETED') {
            return formatResponse(500, { 
                error: 'Transcription failed', 
                details: transcriptionJob.TranscriptionJob.FailureReason 
            });
        }
        
        // Get the transcription result
        const transcriptUri = transcriptionJob.TranscriptionJob.Transcript.TranscriptFileUri;
        const transcriptResponse = await fetch(transcriptUri);
        const transcriptData = await transcriptResponse.json();
        
        // Extract the transcription text
        const transcription = transcriptData.results.transcripts[0].transcript;
        
        return formatResponse(200, { transcription });
    } catch (error) {
        console.error('Error processing audio:', error);
        return formatResponse(500, { error: 'Failed to process audio' });
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