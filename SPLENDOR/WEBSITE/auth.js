window.client = new Appwrite.Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('680364d1000477ec420b');

window.account = new Appwrite.Account(window.client);


async function checkSession() {
  try {
    
    const session = await window.account.getSession('current');
    if (!session) {
      throw new Error('No active session');
    }

    
    const user = await window.account.get();
    if (!user) {
      throw new Error('No user found');
    }
    
    if (user.emailVerification === false) {
      await window.account.deleteSession('current');
      window.location.href = 'Login.html';
      return;
    }
    
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
      userDisplay.innerHTML = `
        <div class="welcome-message">
          Welcome, ${user.name}
        </div>
        <div class="user-email-reveal-container">
          <div class="user-email-cover">Hover to reveal email and user ID</div>
          <div class="user-email-revealed">
            <div class="user-email">${user.email}</div>
            <div class="user-id" style="font-size:0.8em;color:rgba(255,255,255,0.6);margin-top:4px;">${user.$id}</div>
          </div>
        </div>
      `;

      const container = userDisplay.querySelector('.user-email-reveal-container');
      const cover = container.querySelector('.user-email-cover');
      const revealed = container.querySelector('.user-email-revealed');
      let revealTimeout;

      container.addEventListener('mouseenter', () => {
        cover.style.opacity = '0';
        cover.style.pointerEvents = 'none';
        revealed.style.opacity = '1';
        revealed.style.pointerEvents = 'auto';
        
        revealTimeout = setTimeout(() => {
          cover.style.opacity = '1';
          cover.style.pointerEvents = 'auto';
          revealed.style.opacity = '0';
          revealed.style.pointerEvents = 'none';
        }, 3000);
      });

      container.addEventListener('mouseleave', () => {
        clearTimeout(revealTimeout);
        cover.style.opacity = '1';
        cover.style.pointerEvents = 'auto';
        revealed.style.opacity = '0';
        revealed.style.pointerEvents = 'none';
      });
    }
    
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      logoutButton.style.display = 'block';
    }


    if (typeof window.initializeCards === 'function') {
      window.initializeCards();
    }
    
    return user;
  } catch (error) {
    console.error('Session check failed:', error);
    if (window.location.pathname.indexOf('Login.html') === -1) {
      window.location.href = 'Login.html';
    }
    throw error;
  }
}


document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.indexOf('Login.html') === -1 && 
      window.location.pathname.indexOf('Register.html') === -1 &&
      window.location.pathname.indexOf('verify-email.html') === -1) {
    checkSession().catch(error => {
      console.error('Failed to check session:', error);
    });
  }
});

document.getElementById('logoutButton')?.addEventListener('click', function(e) {
  e.preventDefault();
  window.account.deleteSession('current')
    .then(() => {
      window.location.href = 'Login.html';
    })
    .catch(err => {
      console.error('Error logging out:', err);
    });
}); 