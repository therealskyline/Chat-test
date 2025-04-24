
import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, send_from_directory
import os
from werkzeug.utils import secure_filename
import logging

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev_secret_key")
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'mov', 'rbxlx'}
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file size
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

messages = []
connected_users = set()

@app.route('/')
def index():
    username = session.get('username')
    if not username or username not in connected_users:
        session.clear()
        return render_template('index.html', connected=False)
    return render_template('index.html', connected=True, username=username)

@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username')
    if not username:
        return jsonify({'error': 'Username is required'}), 400
    
    # Vérifier si le pseudo est déjà pris
    if username in connected_users:
        return jsonify({'error': 'Ce pseudo est déjà utilisé'}), 400

    # Ne pas nettoyer l'ancienne session d'une autre fenêtre
    session['username'] = username
    connected_users.add(username)
    return jsonify({'success': True})

@app.route('/logout', methods=['POST'])
def logout():
    if 'username' in session:
        username = session['username']
        connected_users.discard(username)
        session.pop('username', None)  # Nettoyer uniquement le username
    return jsonify({'success': True})

@app.route('/send', methods=['POST'])
def send():
    if 'username' not in session:
        return jsonify({'error': 'Not logged in'}), 401

    message = request.form.get('message')
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    timestamp = datetime.now().strftime('%H:%M:%S')
    # Stocker le username au moment de l'envoi du message
    sender_username = session.get('username')
    messages.append({
        'username': sender_username,
        'message': message,
        'timestamp': timestamp
    })

    if len(messages) > 100:
        messages.pop(0)

    return jsonify({'success': True})

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        
        timestamp = datetime.now().strftime('%H:%M:%S')
        messages.append({
            'username': session['username'],
            'message': f'📎 <a href="/uploads/{filename}" target="_blank">{filename}</a>',
            'timestamp': timestamp
        })
        return jsonify({'success': True})
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/messages')
def get_messages():
    if 'username' not in session:
        return jsonify({'error': 'Not logged in'}), 401

    return jsonify({
        'messages': messages,
        'users': list(connected_users)
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
