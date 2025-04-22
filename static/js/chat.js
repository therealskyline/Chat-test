function formatMediaMessage(message) {
    const link = message.match(/href="([^"]+)"/)[1];
    const filename = message.match(/>([^<]+)<\/a>/)[1];
    const extension = filename.split('.').pop().toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif'].includes(extension);
    const isVideo = ['mp4', 'mov', 'avi', 'webm'].includes(extension);

    if (isImage) {
        return `<a href="#" onclick="showMediaPopup('${link}', 'image'); return false;">
                    <img src="${link}" class="chat-thumbnail" alt="${filename}">
                </a>`;
    } else if (isVideo) {
        return `<a href="#" onclick="showMediaPopup('${link}', 'video'); return false;">
                    <div class="video-thumbnail">
                        <i class="bi bi-play-circle"></i>
                        <span>${filename}</span>
                    </div>
                </a>`;
    }
    return `<a href="${link}" target="_blank" download>📎 ${filename}</a>`;
}

function showMediaPopup(url, type) {
    const popup = document.createElement('div');
    popup.className = 'media-popup';
    popup.onclick = (e) => {
        if (e.target === popup) popup.remove();
    };

    const content = type === 'image' 
        ? `<img src="${url}" class="popup-content">` 
        : `<video controls class="popup-content">
            <source src="${url}" type="video/${url.split('.').pop()}">
           </video>`;

    popup.innerHTML = content;
    document.body.appendChild(popup);
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const messageForm = document.getElementById('message-form');
    const logoutButton = document.getElementById('logout');
    const messagesContainer = document.getElementById('messages');
    const usersList = document.getElementById('users-list');

    let polling = null;
    let lastActivityTime = Date.now();
    const INACTIVITY_WARNING_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

    // Fonction pour vérifier l'inactivité
    function checkInactivity() {
        const currentTime = Date.now();
        const timeSinceLastActivity = currentTime - lastActivityTime;

        if (timeSinceLastActivity >= INACTIVITY_WARNING_TIME) {
            const warningMessage = {
                username: 'Système',
                message: '⚠️ Le serveur se mettra en pause après 20 minutes d\'inactivité. Envoyez un message pour maintenir la connexion active.',
                timestamp: new Date().toLocaleTimeString()
            };

            // Ajouter le message d'avertissement
            messagesContainer.innerHTML += `
                <div class="message">
                    <span class="timestamp">[${warningMessage.timestamp}]</span>
                    <span class="username">${warningMessage.username}:</span>
                    <span class="content">${warningMessage.message}</span>
                </div>
            `;

            // Réinitialiser le timer
            lastActivityTime = currentTime;
        }
    }

    // Vérifier l'inactivité toutes les minutes
    setInterval(checkInactivity, 60000);

    // Mettre à jour le timestamp d'activité lors de l'envoi d'un message
    // Gestion de la touche Entrée pour l'envoi du message
    document.getElementById('message')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('message-form').dispatchEvent(new Event('submit'));
        }
    });

    messageForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        lastActivityTime = Date.now();
        const messageInput = document.getElementById('message');
        const fileInput = document.getElementById('file');
        const file = fileInput.files[0];
        const message = messageInput.value.trim();

        // Gestion de l'envoi automatique des fichiers
        fileInput.onchange = async function() {
            const file = this.files[0];
            if (!file) return;

            messageInput.disabled = true;
            const formData = new FormData();
            formData.append('file', file);

            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.innerHTML = `
                <div class="progress">
                    <div class="progress-value"></div>
                </div>
                <div class="progress-text">Chargement: ${file.name}</div>
            `;
            messagesContainer.appendChild(progressBar);

            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/upload', true);

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        progressBar.querySelector('.progress-value').style.width = percentComplete + '%';
                        progressBar.querySelector('.progress-text').textContent = `Chargement: ${Math.round(percentComplete)}%`;
                    }
                };

                xhr.onload = async () => {
                    if (xhr.status === 200) {
                        // On garde la barre de progression jusqu'à ce que le message soit mis à jour
                        fileInput.value = ''; // Reset file input
                        messageInput.disabled = false; // Re-enable message input
                        await updateChat();
                        // On attend un peu avant de supprimer la barre pour s'assurer que le fichier est bien chargé
                        setTimeout(() => {
                            progressBar.remove();
                        }, 1000);
                    } else {
                        const error = JSON.parse(xhr.responseText);
                        throw new Error(error.error || 'Échec du téléchargement');
                    }
                };

                xhr.onerror = () => {
                    progressBar.remove();
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-danger';
                    errorDiv.textContent = 'Erreur lors du téléchargement du fichier';
                    messagesContainer.appendChild(errorDiv);
                    setTimeout(() => errorDiv.remove(), 5000);
                    messageInput.disabled = false; // Re-enable message input
                };

                xhr.send(formData);
            } catch (error) {
                console.error('Error:', error);
                progressBar.remove();
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger';
                errorDiv.textContent = error.message;
                messagesContainer.appendChild(errorDiv);
                setTimeout(() => errorDiv.remove(), 5000);
                messageInput.disabled = false; // Re-enable message input
            }
        };

        if (!file && !message) {
            return;
        } else if (!file){
            try {
                const response = await fetch('/send', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: `message=${encodeURIComponent(message)}`
                });

                if (response.ok) {
                    messageInput.value = '';
                    await updateChat();
                } else {
                    const data = await response.json();
                    alert(data.error || 'Erreur d\'envoi');
                }
            } catch (error) {
                console.error('Erreur:', error);
                alert('Erreur d\'envoi du message');
            }
        }
    });

    // Le reste du code reste inchangé
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: `username=${encodeURIComponent(username)}`
            });
            const data = await response.json();
            if (response.ok) {
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('chatInterface').style.display = 'flex';
                startPolling();
            } else {
                alert(data.error || 'Erreur de connexion');
                document.getElementById('username').value = '';
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur de connexion au serveur');
        }
    });

    logoutButton?.addEventListener('click', async () => {
        try {
            const response = await fetch('/logout', {
                method: 'POST'
            });

            if (response.ok) {
                stopPolling();
                document.getElementById('loginForm').style.display = 'flex';
                document.getElementById('chatInterface').style.display = 'none';
                messagesContainer.innerHTML = '';
                usersList.innerHTML = '';
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur de déconnexion');
        }
    });

    async function updateChat() {
        try {
            const response = await fetch('/messages');
            if (!response.ok) {
                if (response.status === 401) {
                    stopPolling();
                    document.getElementById('loginForm').style.display = 'flex';
                    document.getElementById('chatInterface').style.display = 'none';
                    session.clear();
                    return;
                }
                throw new Error('Erreur de récupération des messages');
            }

            const data = await response.json();

            // Mise à jour des messages
            messagesContainer.innerHTML = data.messages
                .map(msg => `
                    <div class="message">
                        <span class="timestamp">[${msg.timestamp}]</span>
                        <span class="username">${msg.username}:</span>
                        <span class="content">
                            ${msg.message.includes('<a href=') ? 
                                formatMediaMessage(msg.message) : 
                                escapeHtml(msg.message)}
                        </span>
                    </div>
                `).join('');

            // Scroll automatique vers le bas
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            // Mise à jour de la liste des utilisateurs
            usersList.innerHTML = data.users
                .map(user => `
                    <li class="list-group-item">
                        <i class="bi bi-person-fill"></i> ${user}
                    </li>
                `).join('');
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    function startPolling() {
        updateChat();
        polling = setInterval(updateChat, 2000);
    }

    function stopPolling() {
        if (polling) {
            clearInterval(polling);
            polling = null;
        }
    }
});