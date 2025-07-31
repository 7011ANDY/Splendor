const client = new Appwrite.Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('680364d1000477ec420b');

const account = new Appwrite.Account(client);

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const username = document.getElementById('username').value;
    const dob = document.getElementById('dob').value;
    const gender = document.getElementById('gender').value;
    
    if (!email || !password || !confirmPassword || !username || !dob || !gender) {
        alert('Please fill in all fields');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    try {
        const user = await account.create('unique()', email, password, username);
        console.log('User created:', user);
        

        const session = await account.createEmailPasswordSession(email, password);
        console.log('Session created:', session);
        

        const currentSession = await account.getSession('current');
        if (!currentSession) {
            throw new Error('Failed to create active session');
        }
        

        let existingPrefs = {};
        try {
            existingPrefs = await account.getPrefs();
        } catch (error) {
            existingPrefs = {};
        }
        
        const prefs = { ...existingPrefs };
        prefs.dateOfBirth = dob;
        prefs.gender = gender;
        
        await account.updatePrefs(prefs);
        
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registration failed: ' + (error.message || 'Unknown error'));
    }
});


