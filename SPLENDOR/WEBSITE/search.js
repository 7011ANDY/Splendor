const client = new Appwrite.Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('680364d1000477ec420b');

const databases = new Appwrite.Databases(client);
const DATABASE_ID = '6816dc7f00195dd533bf';
const COLLECTION_ID = '6816de0600052ed834e4';
const CODE_COLLECTION_ID = '682215d200201cb95f05';

let currentPage = 0;
let isLoading = false;
let hasMoreProjects = true;
let currentQuery = '';
let currentSort = 'createdD';
let currentOrder = 'desc';
let rateLimitTimer = null;

let previousQuery = '';
let previousSort = 'createdD';
let previousOrder = 'desc';

let searchInput, sortButton, orderButton, projectsGrid, resultsCount, loadingIndicator, loadMoreContainer, rateLimitOverlay, rateLimitBtn, sortPopup, orderPopup;

const PROJECTS_PER_PAGE = 12;
const RATE_LIMIT_DELAY = 1000;

function loadSearchSettings() {
    try {
        const savedSettings = localStorage.getItem('splendor_search_settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            currentSort = settings.sort || 'createdD';
            currentOrder = settings.order || 'desc';
            currentQuery = settings.query || '';
            
            previousSort = currentSort;
            previousOrder = currentOrder;
            previousQuery = currentQuery;
            
            updateSortButtonText();
            updateOrderButtonText();
            updatePopupSelections();
            if (searchInput) searchInput.value = currentQuery;
            
            console.log('Search settings loaded from localStorage:', settings);
        }
    } catch (error) {
        console.error('Error loading search settings:', error);
    }
}

function saveSearchSettings() {
    try {
        const settings = {
            sort: currentSort,
            order: currentOrder,
            query: currentQuery
        };
        localStorage.setItem('splendor_search_settings', JSON.stringify(settings));
        console.log('Search settings saved to localStorage:', settings);
    } catch (error) {
        console.error('Error saving search settings:', error);
    }
}

function updateSortButtonText() {
    const sortButtonText = document.getElementById('sortButtonText');
    if (sortButtonText) {
        sortButtonText.textContent = currentSort === 'createdD' ? 'Newest' : 'Views';
    }
}

function updateOrderButtonText() {
    const orderButtonText = document.getElementById('orderButtonText');
    if (orderButtonText) {
        orderButtonText.textContent = currentOrder === 'desc' ? 'Descending' : 'Ascending';
    }
}

function updatePopupSelections() {
    document.querySelectorAll('#sortPopup .popup-option').forEach(option => {
        if (option.dataset.value === currentSort) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
    
    document.querySelectorAll('#orderPopup .popup-option').forEach(option => {
        if (option.dataset.value === currentOrder) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

function hasSearchSettingsChanged() {
    return previousQuery !== currentQuery || 
           previousSort !== currentSort || 
           previousOrder !== currentOrder;
}

function updatePreviousSettings() {
    previousQuery = currentQuery;
    previousSort = currentSort;
    previousOrder = currentOrder;
}

function showNotification(message, duration = 2000) {
    const existingNotification = document.getElementById('searchNotification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'searchNotification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1f1f23;
        border: 1px solid #4c1d95;
        border-radius: 8px;
        padding: 12px 16px;
        color: #ececec;
        font-size: 14px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, duration);
}

function initializeDOMElements() {
    searchInput = document.getElementById('searchInput');
    sortButton = document.getElementById('sortButton');
    orderButton = document.getElementById('orderButton');
    projectsGrid = document.getElementById('projectsGrid');
    resultsCount = document.getElementById('resultsCount');
    loadingIndicator = document.getElementById('loadingIndicator');
    loadMoreContainer = document.getElementById('loadMoreContainer');
    rateLimitOverlay = document.getElementById('rateLimitOverlay');
    rateLimitBtn = document.getElementById('rateLimitBtn');
    sortPopup = document.getElementById('sortPopup');
    orderPopup = document.getElementById('orderPopup');
}

function showLoading() {
    isLoading = true;
    loadingIndicator.style.display = 'flex';
}

function hideLoading() {
    isLoading = false;
    loadingIndicator.style.display = 'none';
}

function showRateLimit() {
    rateLimitOverlay.style.display = 'flex';
}

function hideRateLimit() {
    rateLimitOverlay.style.display = 'none';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function createProjectCard(project) {
    console.log('Creating project card for:', project.$id, project.title);
    
    const card = document.createElement('div');
    card.className = 'project-card';
    card.tabIndex = 0;
    
    card.innerHTML = `
        <div class="project-preview">
            <div class="preview-loading">
                <span class="material-icons">visibility</span>
                <span>Loading preview...</span>
            </div>
        </div>
        <div class="project-content">
            <div class="project-header">
                <div>
                    <div class="project-title">${escapeHtml(project.title)}</div>
                    <div class="project-author">
                        <span class="author-text">by <a class="author-name" href="#" style="margin-left:6px;">Loading...</a></span>
                        <img class="author-avatar" src="" alt="Author" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; margin-left: 10px;">
                    </div>
                </div>
            </div>
            <div class="project-description">${escapeHtml(project.description)}</div>
            <div class="project-meta">
                <div class="project-stats">
                    <div class="stat">
                        <span class="material-icons stat-icon">visibility</span>
                        <span>${formatNumber(project.viewCount || 0)}</span>
                    </div>
                </div>
                <div class="project-date">${formatDate(project.createdD)}</div>
            </div>
        </div>
    `;
    
    console.log('Card HTML created, calling loadPreview');
    
    loadPreview(card, project);
    
    loadAuthorInfo(card, project.userId);
    
    card.addEventListener('click', (e) => {
        if (e.target.closest('.author-name')) {
            return;
        }
        window.location.href = `editor.html?projectId=${project.$id}`;
    });
    
    card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = `editor.html?projectId=${project.$id}`;
        }
    });
    
    console.log('Project card created successfully');
    return card;
}

async function loadPreview(card, project) {
    const previewContainer = card.querySelector('.project-preview');
    let previewLoaded = false;
    
    console.log('loadPreview called for project:', project.$id);
    
    async function loadPreviewContent() {
        if (previewLoaded) return;
        previewLoaded = true;
        
        console.log('Loading preview content for project:', project.$id);
        
        try {
            console.log('Fetching code document for project:', project.$id);
            const codeDoc = await databases.getDocument(DATABASE_ID, CODE_COLLECTION_ID, project.$id);
            console.log('Code document fetched:', codeDoc);
            
            const html = codeDoc.html_code || '';
            const css = codeDoc.css_code || '';
            const js = codeDoc.js_code || '';
            
            console.log('Code content - HTML length:', html.length, 'CSS length:', css.length, 'JS length:', js.length);
            
            const totalSize = html.length + css.length + js.length;
            if (totalSize > 1000000) {
                console.warn('Large project detected, using simplified preview for:', project.$id);
                previewContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #1a1a1a; color: #71717a; font-size: 14px; text-align: center; padding: 20px;">
                        <div>
                            <div style="margin-bottom: 8px;">📁 Large Project</div>
                            <div style="font-size: 12px;">Click to view full project</div>
                        </div>
                    </div>
                `;
                return;
            }
            
            const isFullHTML = html.toLowerCase().includes('<!doctype') || html.toLowerCase().includes('<html');
            
            const consoleOverrideScript = `
                <script type="text/javascript">
                if (!window._consoleOverridden) {
                    window._consoleOverridden = true;
                    window._originalConsole = {
                        log: console.log,
                        error: console.error,
                        warn: console.warn,
                        info: console.info
                    };
                    function sendToParent(type, ...args) {
                        window.parent.postMessage({
                            type: 'console', 
                            method: type, 
                            args: args.map(arg => {
                                if (typeof arg === 'object') {
                                    try {return JSON.stringify(arg);} catch (e) {return String(arg);}
                                }
                                return String(arg);
                            })
                        }, '*');
                    }
                    console.log = (...args) => {
                        window._originalConsole.log.apply(console, args);
                        sendToParent('log', ...args);
                    };
                    console.error = (...args) => {
                        window._originalConsole.error.apply(console, args);
                        sendToParent('error', ...args);
                    };
                    console.warn = (...args) => {
                        window._originalConsole.warn.apply(console, args);
                        sendToParent('warn', ...args);
                    };
                    console.info = (...args) => {
                        window._originalConsole.info.apply(console, args);
                        sendToParent('info', ...args);
                    };
                }
                window.open = () => {};
                </script>
            `;
            
            const userScript = `<script type="text/javascript">
                try {
                    ${js}
                } catch(e) {
                    console.error('Preview JS Error:', e);
                }
            </script>`;
            
            let processedHtml = html;
            if (!isFullHTML) {
                processedHtml = processedHtml.replace(
                    /https:\/\/via\.placeholder\.com\/(\d+)x(\d+)/g,
                    (match, width, height) => {
                        const svgContent = `
                            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                                <rect width="100%" height="100%" fill="#ddd"/>
                                <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#666" text-anchor="middle" dy=".3em">
                                    ${width}x${height}
                                </text>
                            </svg>
                        `;
                        return 'data:image/svg+xml;base64,' + btoa(svgContent);
                    }
                );
            }
            
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { margin: 0; padding: 0; overflow: hidden; }
                        ${css}
                    </style>
                    ${consoleOverrideScript}
                </head>
                <body>
                    ${processedHtml}
                    ${userScript}
                </body>
                </html>
            `;
            
            console.log('Creating iframe for preview');
            const iframe = document.createElement('iframe');
            iframe.className = 'preview-iframe';
            iframe.sandbox = 'allow-scripts allow-same-origin';
            iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: #fff;';
            
            console.log('Iframe created, setting up onload handler');
            
            iframe.onload = () => {
                console.log('Iframe loaded successfully');
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        const viewport = iframeDoc.querySelector('meta[name="viewport"]');
                        if (viewport) {
                            viewport.setAttribute('content', 'width=device-width, initial-scale=0.8, user-scalable=no');
                        }
                    }
                } catch (e) {
                    console.log('Preview viewport error:', e);
                }
            };
            
            iframe.onerror = (e) => {
                console.error('Iframe error:', e);
                previewContainer.innerHTML = `
                    <div style="width: 100%; height: 100%; background: #fff;"></div>
                `;
            };
            
            previewContainer.innerHTML = '';
            previewContainer.appendChild(iframe);
            
            iframe.srcdoc = fullHtml;
            
        } catch (error) {
            console.error('Error loading preview:', error);
            
            if (error.code === 404) {
                previewContainer.innerHTML = `
                    <div style="width: 100%; height: 100%; background: #fff;"></div>
                `;
            } else {
                previewContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #1a1a1a; color: #ef4444; font-size: 14px;">
                        Preview Error
                    </div>
                `;
            }
        }
    }
    
    if ('IntersectionObserver' in window) {
        console.log('Setting up IntersectionObserver for project:', project.$id);
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    console.log('Project card became visible:', project.$id);
                    loadPreviewContent();
                    obs.unobserve(card);
                }
            });
        }, { threshold: 0.2 });
        observer.observe(card);
    } else {
        console.log('Using hover fallback for project:', project.$id);
        card.addEventListener('mouseenter', loadPreviewContent, { once: true });
    }
}

async function loadAuthorInfo(card, userId) {
    try {
        const authorNameElement = card.querySelector('.author-name');
        const authorAvatarElement = card.querySelector('.author-avatar');
        
        const DATABASE_ID = '6816dc7f00195dd533bf';
        const PROFILES_COLLECTION_ID = '682ce6e0002bb5c45134';
        
        const response = await databases.listDocuments(
            DATABASE_ID,
            PROFILES_COLLECTION_ID,
            [Appwrite.Query.equal('userId', userId)]
        );
        
        if (response.documents.length > 0) {
            const userProfile = response.documents[0];
            const username = userProfile.username || 'Unknown User';
            
            authorNameElement.textContent = username;
            authorNameElement.href = `profile.html?id=${encodeURIComponent(userId)}`;
            authorNameElement.target = '_blank';
            authorNameElement.rel = 'noopener noreferrer';
            
            if (userProfile.profilePictureId) {
                try {
                    const storage = new Appwrite.Storage(window.client);
                    const BUCKET_ID = '682cdce1002d845e909c';
                    const imageUrl = storage.getFileView(BUCKET_ID, userProfile.profilePictureId);
                    authorAvatarElement.src = imageUrl;
                    authorAvatarElement.onerror = function() {
                        authorAvatarElement.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username.substring(0,2))}`;
                    };
                } catch (error) {
                    console.error('Error loading author profile picture:', error);
                    authorAvatarElement.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username.substring(0,2))}`;
                }
            } else {
                authorAvatarElement.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username.substring(0,2))}`;
            }
        } else {
            authorNameElement.textContent = 'Unknown User';
            authorNameElement.href = '#';
            authorAvatarElement.src = `https://api.dicebear.com/7.x/initials/svg?seed=U`;
        }
    } catch (error) {
        console.error('Error fetching author info:', error);
        const authorNameElement = card.querySelector('.author-name');
        const authorAvatarElement = card.querySelector('.author-avatar');
        authorNameElement.textContent = 'Unknown User';
        authorNameElement.href = '#';
        authorAvatarElement.src = `https://api.dicebear.com/7.x/initials/svg?seed=U`;
    }
}

function createSkeletonCard() {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
        <div class="skeleton-preview skeleton"></div>
        <div class="skeleton-content">
            <div class="skeleton-title skeleton"></div>
            <div class="skeleton-description skeleton"></div>
            <div class="skeleton-description skeleton"></div>
            <div class="skeleton-meta skeleton"></div>
        </div>
    `;
    return card;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSkeletonLoading() {
    projectsGrid.innerHTML = '';
    for (let i = 0; i < PROJECTS_PER_PAGE; i++) {
        projectsGrid.appendChild(createSkeletonCard());
    }
}

async function fetchProjects(reset = false) {
    if (isLoading) return;
    
    console.log('fetchProjects called, reset:', reset);
    
    if (rateLimitTimer) {
        showRateLimit();
        return;
    }
    
    try {
        showLoading();
        
        if (reset) {
            currentPage = 0;
            projectsGrid.innerHTML = '';
            hasMoreProjects = true;
        }
        
        let queries = [Appwrite.Query.equal('visibility', 'public')];
        
        if (currentQuery.trim()) {
            console.log('Using server-side search with fulltext indexes');
            console.log('Search term:', currentQuery);
            console.log('Collection ID:', COLLECTION_ID);
            
            const baseQuery = [Appwrite.Query.equal('visibility', 'public')];
            const sortQuery = currentOrder === 'desc' 
                ? Appwrite.Query.orderDesc(currentSort)
                : Appwrite.Query.orderAsc(currentSort);
            const limitQuery = Appwrite.Query.limit(PROJECTS_PER_PAGE);
            const offsetQuery = Appwrite.Query.offset(currentPage * PROJECTS_PER_PAGE);
            
            const titleQueries = [...baseQuery, Appwrite.Query.search('title', currentQuery), sortQuery, limitQuery, offsetQuery];
            console.log('Title search queries:', titleQueries);
            
            const descriptionQueries = [...baseQuery, Appwrite.Query.search('description', currentQuery), sortQuery, limitQuery, offsetQuery];
            console.log('Description search queries:', descriptionQueries);
            
            try {
                const [titleResponse, descriptionResponse] = await Promise.all([
                    databases.listDocuments(DATABASE_ID, COLLECTION_ID, titleQueries),
                    databases.listDocuments(DATABASE_ID, COLLECTION_ID, descriptionQueries)
                ]);
                
                const titleProjects = titleResponse.documents;
                const descriptionProjects = descriptionResponse.documents;
                
                console.log('Title search results:', titleProjects.length);
                console.log('Description search results:', descriptionProjects.length);
                
                const allProjects = [...titleProjects, ...descriptionProjects];
                const uniqueProjects = allProjects.filter((project, index, self) => 
                    index === self.findIndex(p => p.$id === project.$id)
                );
                
                uniqueProjects.sort((a, b) => {
                    if (currentSort === 'createdD') {
                        return currentOrder === 'desc' 
                            ? new Date(b.createdD) - new Date(a.createdD)
                            : new Date(a.createdD) - new Date(b.createdD);
                    }
                    return 0;
                });
                
                const startIndex = currentPage * PROJECTS_PER_PAGE;
                const endIndex = startIndex + PROJECTS_PER_PAGE;
                const projects = uniqueProjects.slice(startIndex, endIndex);
                
                console.log('Combined unique projects:', uniqueProjects.length);
                console.log('Paginated projects:', projects.length);
                console.log('Projects:', projects.map(p => ({ id: p.$id, title: p.title, description: p.description })));
                
                hasMoreProjects = projects.length === PROJECTS_PER_PAGE;
                currentPage++;
                
                if (reset) {
                    projectsGrid.innerHTML = '';
                }
                
                projects.forEach(project => {
                    console.log('Adding project to grid:', project.$id);
                    projectsGrid.appendChild(createProjectCard(project));
                });
                
                updateResultsCount(uniqueProjects.length);
                
                rateLimitTimer = setTimeout(() => {
                    rateLimitTimer = null;
                }, RATE_LIMIT_DELAY);
                
                updatePreviousSettings();
                
                return;
                
            } catch (error) {
                console.error('Error with combined search:', error);
            }
        }
        
        if (currentOrder === 'desc') {
            queries.push(Appwrite.Query.orderDesc(currentSort));
        } else {
            queries.push(Appwrite.Query.orderAsc(currentSort));
        }
        
        queries.push(Appwrite.Query.limit(PROJECTS_PER_PAGE));
        queries.push(Appwrite.Query.offset(currentPage * PROJECTS_PER_PAGE));
        
        console.log('Fetching projects with queries:', queries);
        console.log('Collection ID being used:', COLLECTION_ID);
        
        const response = await databases.listDocuments(
            DATABASE_ID,
            COLLECTION_ID,
            queries
        );
        
        const projects = response.documents;
        
        console.log('Projects fetched:', projects.length, 'projects');
        console.log('Total projects in collection:', response.total);
        console.log('Projects:', projects.map(p => ({ id: p.$id, title: p.title, description: p.description })));
        
        hasMoreProjects = projects.length === PROJECTS_PER_PAGE;
        currentPage++;
        
        if (reset) {
            projectsGrid.innerHTML = '';
        }
        
        projects.forEach(project => {
            console.log('Adding project to grid:', project.$id);
            projectsGrid.appendChild(createProjectCard(project));
        });
        
        updateResultsCount(response.total);
        
        rateLimitTimer = setTimeout(() => {
            rateLimitTimer = null;
        }, RATE_LIMIT_DELAY);
        
        updatePreviousSettings();
        
    } catch (error) {
        console.error('Error fetching projects:', error);
        
        if (error.code === 429) {
            showRateLimit();
        } else {
            showError('Failed to load projects. Please try again.');
        }
    } finally {
        hideLoading();
    }
}

function updateResultsCount(total) {
    if (total === 0) {
        resultsCount.textContent = 'No projects found';
    } else {
        resultsCount.textContent = `${total} project${total === 1 ? '' : 's'} found`;
    }
}

function showError(message) {
    projectsGrid.innerHTML = `
        <div class="error-state">
            <div class="error-icon">⚠️</div>
            <div class="error-title">Error</div>
            <div class="error-description">${message}</div>
        </div>
    `;
}

function showEmptyState() {
    projectsGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">No projects found</div>
            <div class="empty-state-description">Try adjusting your search terms or filters to find more projects.</div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    
    loadSearchSettings();
    
    searchInput.addEventListener('input', (e) => {
        currentQuery = e.target.value.trim();
        console.log('Search input changed:', currentQuery);
        saveSearchSettings();
    });

    const searchBtn = document.getElementById('searchBtn');
    searchBtn.addEventListener('click', () => {
        console.log('Search button clicked');
        if (hasSearchSettingsChanged()) {
            fetchProjects(true);
        } else {
            console.log('Search settings unchanged, skipping refresh');
            showNotification('Search settings unchanged - no refresh needed');
        }
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            console.log('Enter key pressed in search input');
            if (hasSearchSettingsChanged()) {
                fetchProjects(true);
            } else {
                console.log('Search settings unchanged, skipping refresh');
                showNotification('Search settings unchanged - no refresh needed');
            }
        }
    });

    sortButton.addEventListener('click', () => {
        sortButton.classList.toggle('active');
        if (sortButton.classList.contains('active')) {
            sortPopup.style.display = 'flex';
        } else {
            sortPopup.style.display = 'none';
        }
    });

    orderButton.addEventListener('click', () => {
        orderButton.classList.toggle('active');
        if (orderButton.classList.contains('active')) {
            orderPopup.style.display = 'flex';
        } else {
            orderPopup.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!sortButton.contains(e.target) && !sortPopup.contains(e.target)) {
            sortButton.classList.remove('active');
            sortPopup.style.display = 'none';
        }
        if (!orderButton.contains(e.target) && !orderPopup.contains(e.target)) {
            orderButton.classList.remove('active');
            orderPopup.style.display = 'none';
        }
    });

    document.querySelectorAll('#sortPopup .popup-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.dataset.value;
            currentSort = value;
            updateSortButtonText();
            updatePopupSelections();
            saveSearchSettings();
            sortButton.classList.remove('active');
            sortPopup.style.display = 'none';
            if (hasSearchSettingsChanged()) {
                fetchProjects(true);
            } else {
                console.log('Sort setting unchanged, skipping refresh');
                showNotification('Sort setting unchanged - no refresh needed');
            }
        });
    });

    document.querySelectorAll('#orderPopup .popup-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.dataset.value;
            currentOrder = value;
            updateOrderButtonText();
            updatePopupSelections();
            saveSearchSettings();
            orderButton.classList.remove('active');
            orderPopup.style.display = 'none';
            if (hasSearchSettingsChanged()) {
                fetchProjects(true);
            } else {
                console.log('Order setting unchanged, skipping refresh');
                showNotification('Order setting unchanged - no refresh needed');
            }
        });
        });
    
    rateLimitBtn.addEventListener('click', hideRateLimit);
    
    showSkeletonLoading();
    fetchProjects(true);
    setupInfiniteScroll();
});

let observer = null;
function setupInfiniteScroll() {
    const sentinel = document.getElementById('infiniteScrollSentinel');
    if (!sentinel) return;
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMoreProjects && !isLoading) {
            fetchProjects(false);
        }
    }, {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    });
    observer.observe(sentinel);
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await checkSession();
    } catch (error) {
        console.log('User not authenticated, but search page is accessible');
    }
}); 