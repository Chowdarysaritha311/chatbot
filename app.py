from flask import Flask, render_template, request, jsonify, session, Response
from flask_cors import CORS
import openai
import os
from dotenv import load_dotenv
import json
from datetime import datetime
import uuid

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "your-secret-key-here-change-in-production")
CORS(app)

# Initialize OpenAI client
openai.api_key = os.getenv("OPENAI_API_KEY")

# Conversation storage (in production, use a database)
conversations = {}

@app.route('/')
def home():
    """Render the main chat interface"""
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    """Handle chat messages with streaming"""
    try:
        data = request.json
        message = data.get('message', '')
        conversation_id = data.get('conversation_id')
        
        if not message:
            return jsonify({'error': 'No message provided'}), 400
        
        # Create or retrieve conversation
        if not conversation_id or conversation_id not in conversations:
            conversation_id = str(uuid.uuid4())
            conversations[conversation_id] = {
                'id': conversation_id,
                'messages': [],
                'created_at': datetime.now().isoformat(),
                'title': message[:50] + ('...' if len(message) > 50 else '')
            }
        
        # Add user message to conversation
        conversations[conversation_id]['messages'].append({
            'role': 'user',
            'content': message,
            'timestamp': datetime.now().isoformat()
        })
        
        # Get conversation history for context
        messages_history = [
            {"role": msg['role'], "content": msg['content']}
            for msg in conversations[conversation_id]['messages']
        ]
        
        def generate():
            """Generate streaming response"""
            full_response = ""
            
            # Create chat completion with streaming
            stream = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=messages_history,
                stream=True,
                temperature=0.7,
                max_tokens=1000
            )
            
            for chunk in stream:
                if 'choices' in chunk and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if 'content' in delta:
                        content = delta.content
                        full_response += content
                        yield f"data: {json.dumps({'content': content})}\n\n"
            
            # Save assistant's response to conversation
            conversations[conversation_id]['messages'].append({
                'role': 'assistant',
                'content': full_response,
                'timestamp': datetime.now().isoformat()
            })
            
            # Update conversation title if it's the first response
            if len(conversations[conversation_id]['messages']) == 2:
                conversations[conversation_id]['title'] = full_response[:50] + ('...' if len(full_response) > 50 else '')
            
            yield f"data: {json.dumps({'conversation_id': conversation_id, 'done': True})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    """Get all conversations"""
    return jsonify(list(conversations.values()))

@app.route('/api/conversations/<conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    """Get a specific conversation"""
    if conversation_id in conversations:
        return jsonify(conversations[conversation_id])
    return jsonify({'error': 'Conversation not found'}), 404

@app.route('/api/conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    """Delete a conversation"""
    if conversation_id in conversations:
        del conversations[conversation_id]
        return jsonify({'success': True})
    return jsonify({'error': 'Conversation not found'}), 404

@app.route('/api/clear', methods=['POST'])
def clear_conversations():
    """Clear all conversations"""
    conversations.clear()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
