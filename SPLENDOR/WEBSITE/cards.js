
const databases = new Appwrite.Databases(window.client);

const DATABASE_ID = '6816dc7f00195dd533bf';
const COLLECTION_ID = '6816de0600052ed834e4';

const MAX_PROJECTS = 15;
const MAX_TAGS = 15;


const COLOR_PALETTE = {
  1: 'rgb(46, 213, 115)',
  2: 'rgb(52, 152, 219)',
  3: 'rgb(231, 76, 60)',
  4: 'rgb(241, 196, 15)', 
  5: 'rgb(155, 89, 182)',
  6: 'rgb(230, 126, 34)',
  7: 'rgb(26, 188, 156)',
  8: 'rgb(236, 240, 241)',
  9: 'rgb(149, 165, 166)',
  10: 'rgb(243, 156, 18)'
};


async function initializeCards() {
  console.log('Initializing cards...');
  try {

    const user = await window.account.get();
    console.log('User:', user);
    

    console.log('Loading cards...');
    await loadCards(user.$id);
  } catch (error) {
    console.error('Error initializing cards:', error);
    if (error.code === 401) {
      window.location.href = 'Login.html';
    }
  }
}
window.initializeCards = initializeCards;


async function loadCards(userId) {
  try {
    console.log('Fetching cards for user:', userId);

    const userCards = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Appwrite.Query.equal('userId', userId)
    ], 100, 0, undefined, undefined, [
      'title', 'description', 'userId', 'visibility', 'last_modified', 'createdD', 'tag_Text', 'tag_Colors'
    ]);

    console.log('User cards:', userCards);

    const cardsContainer = document.getElementById('cardsContainer');
    if (!cardsContainer) {
      console.error('Cards container not found!');
      return;
    }
    
    cardsContainer.innerHTML = '';


    const uniqueTags = new Map(); 
    userCards.documents.forEach(card => {
      const tagTexts = card.tag_Text ? card.tag_Text.split(',').filter(t => t.trim()) : [];
      const tagColors = card.tag_Colors ? card.tag_Colors.split(',').filter(c => c.trim()) : [];
      
      tagTexts.forEach((text, index) => {
        if (!uniqueTags.has(text)) {
          uniqueTags.set(text, tagColors[index] || '1');
        }
      });
    });

    
    const userTagsContainer = document.getElementById('userTags');
    if (userTagsContainer) {
      userTagsContainer.innerHTML = '';

      const allTagElement = document.createElement('span');
      allTagElement.className = 'sidebar-tag all-tag active';
      allTagElement.textContent = 'All';
      
      
      allTagElement.addEventListener('click', () => {
        
        document.querySelectorAll('.sidebar-tag').forEach(tag => {
          tag.classList.remove('active');
        });
        
        allTagElement.classList.add('active');
        
        document.querySelectorAll('.card').forEach(card => {
          if (card.style.display === 'none') {
            card.style.display = '';
            card.classList.add('showing');
            setTimeout(() => {
              card.classList.remove('showing');
            }, 300);
          }
        });
      });
      
      userTagsContainer.appendChild(allTagElement);

      
      uniqueTags.forEach((colorChoice, tagText) => {
        const color = COLOR_PALETTE[parseInt(colorChoice) || 1];
        const bgColor = color.replace('rgb', 'rgba').replace(')', ', 0.92)');
        
        const tagElement = document.createElement('span');
        tagElement.className = 'sidebar-tag';
        tagElement.textContent = tagText;
        tagElement.style.backgroundColor = bgColor;
        tagElement.setAttribute('data-color', colorChoice);
        
        
        tagElement.addEventListener('click', () => {
          
          tagElement.classList.toggle('active');
          
          
          allTagElement.classList.remove('active');
          
         
          const activeTags = Array.from(document.querySelectorAll('.sidebar-tag.active'))
            .map(tag => tag.textContent)
            .filter(text => text !== 'All');
          
          
          if (activeTags.length === 0) {
            allTagElement.classList.add('active');
            document.querySelectorAll('.card').forEach(card => {
              if (card.style.display === 'none') {
                card.style.display = '';
                card.classList.add('showing');
                setTimeout(() => {
                  card.classList.remove('showing');
                }, 300);
              }
            });
            return;
          }
          
       
          document.querySelectorAll('.card').forEach(card => {
            const cardTags = Array.from(card.querySelectorAll('.tag'))
              .map(tag => tag.textContent.trim());
            
            const shouldShow = activeTags.some(tag => cardTags.includes(tag));
            
            if (shouldShow && card.style.display === 'none') {
            
              card.style.display = '';
              card.classList.add('showing');
              setTimeout(() => {
                card.classList.remove('showing');
              }, 300);
            } else if (!shouldShow && card.style.display !== 'none') {
              card.classList.add('hiding');
              setTimeout(() => {
                card.style.display = 'none';
                card.classList.remove('hiding');
              }, 300);
            }
          });
        });
        
        userTagsContainer.appendChild(tagElement);
      });
    }


    const createButton = document.createElement('button');
    createButton.className = 'create-card-button';
    createButton.innerHTML = `
      <span>+</span>
      <p>Create New Project</p>
    `;
    createButton.addEventListener('click', async () => {
      const limits = await checkUserLimits();
      
      if (!limits.canCreateProject) {
        alert(`You have reached the maximum limit of ${MAX_PROJECTS} projects. Please delete some projects before creating new ones.`);
        return;
      }
      
      window.location.href = 'final_updated_finished_create-project.html';
    });
    cardsContainer.appendChild(createButton);


    if (userCards.documents.length === 0) {
      console.log('No cards found, showing empty state...');
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <div class="empty-state-content">
          <div class="empty-state-icon">🎨</div>
          <div class="empty-state-title">No projects yet</div>
          <div class="empty-state-description">Create your first project to get started!</div>
        </div>
      `;
      cardsContainer.appendChild(emptyState);
      window.dispatchEvent(new Event('cardsLoaded'));
      return;
    }

    userCards.documents.forEach(doc => {
      const card = createCardElement(doc, true);
      cardsContainer.appendChild(card);
    });
    window.dispatchEvent(new Event('cardsLoaded'));
  } catch (error) {
    console.error('Error loading cards:', error);
    alert('Error loading cards. Please check your connection and try again.');
    window.dispatchEvent(new Event('cardsLoaded'));
  }
}

async function checkUserLimits() {
  try {
    const user = await window.account.get();
    
    const userProjects = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [Appwrite.Query.equal('userId', user.$id)]
    );
    
    const projectCount = userProjects.documents.length;
    
    const uniqueTags = new Set();
    userProjects.documents.forEach(project => {
      const tagTexts = project.tag_Text ? project.tag_Text.split(',').filter(t => t.trim()) : [];
      tagTexts.forEach(tag => uniqueTags.add(tag.trim()));
    });
    
    const tagCount = uniqueTags.size;
    
    return {
      projectCount,
      tagCount,
      canCreateProject: projectCount < MAX_PROJECTS,
      canAddTags: tagCount < MAX_TAGS
    };
  } catch (error) {
    console.error('Error checking user limits:', error);
    return {
      projectCount: 0,
      tagCount: 0,
      canCreateProject: true,
      canAddTags: true
    };
  }
}

async function createCard(cardData) {
  try {
    
    if (!cardData.title || cardData.title.length > 64) {
      throw new Error('Title must be a valid string and no longer than 64 characters');
    }
    if (!cardData.description || cardData.description.length > 100) {
      throw new Error('Description must be a valid string and no longer than 100 characters');
    }


    if (!Array.isArray(cardData.tag_Text) || !Array.isArray(cardData.tag_Colors)) {
      throw new Error('Tags must be provided as arrays before conversion');
    }


    const validatedTags = cardData.tag_Text.map(tag => {
      const tagStr = String(tag).trim();
      if (tagStr.length === 0 || tagStr.length > 20) {
        throw new Error('Each tag must be between 1 and 20 characters');
      }
      return tagStr;
    });


    const validatedColors = cardData.tag_Colors.map(color => String(color).trim());


    const tagTextString = validatedTags.join(',');
    const tagColorsString = validatedColors.join(',');

    console.log('Creating card with validated data:', {
      ...cardData,
      tag_Text: tagTextString,
      tag_Colors: tagColorsString
    });

    const response = await databases.createDocument(
      DATABASE_ID,
      COLLECTION_ID,
      'unique()',
      {
        title: cardData.title,
        description: cardData.description,
        userId: cardData.userId,
        visibility: cardData.visibility,
        last_modified: cardData.last_modified,
        createdD: cardData.createdD,
        tag_Text: tagTextString,
        tag_Colors: tagColorsString
      }
    );
    console.log('Card created:', response);
    return response;
  } catch (error) {
    console.error('Error creating card:', error);
    throw error;
  }
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function createCardElement(cardData, isOwner) {
  console.log('Creating card element:', cardData);
  const card = document.createElement('div');
  card.className = 'card';
  

  const lastModified = new Date(cardData.last_modified);
  const now = new Date();
  const isOld = (now - lastModified) > (7 * 24 * 60 * 60 * 1000);
  
  const formattedDate = lastModified.toLocaleDateString();
  const formattedTime = lastModified.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });


  const tagTexts = cardData.tag_Text ? cardData.tag_Text.split(',') : [];
  const tagColors = cardData.tag_Colors ? cardData.tag_Colors.split(',') : [];

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title" data-text="${escapeHtml(cardData.title)}">${escapeHtml(cardData.title)}</div>
      <div class="card-meta">
        <span class="card-visibility ${cardData.visibility === 'public' ? 'public' : cardData.visibility === 'unlisted' ? 'unlisted' : 'private'}">
          ${cardData.visibility === 'public' ? 'Public' : cardData.visibility === 'unlisted' ? 'Unlisted' : 'Private'}
        </span>
        <span class="last-modified ${isOld ? 'old-project' : ''}">
          <div class="modified-date">${formattedDate}</div>
          <div class="modified-time">${formattedTime}</div>
        </span>
      </div>
    </div>
    <div class="card-content">${escapeHtml(cardData.description)}</div>
    <div class="card-preview"><div class="preview-loading-text">Preview Loading…</div></div>
    <div class="card-tags">
      ${tagTexts.map((text, index) => {
        const colorChoice = parseInt(tagColors[index]) || 1;
        const color = COLOR_PALETTE[colorChoice];
        const bgColor = color.replace('rgb', 'rgba').replace(')', ', 0.92)');
        return `
          <span class="tag" style="background-color: ${escapeHtml(bgColor)}; color: white;">
            ${escapeHtml(text)}
          </span>
        `;
      }).join('')}
    </div>
    <button class="card-menu-btn" title="More options">&#8942;</button>
    <div class="card-menu-popup">
      <button class="card-menu-rename">Rename</button>
      <button class="card-menu-delete">Delete</button>
      <button class="card-menu-visibility">Update Visibility</button>
      <button class="card-menu-description">Edit Description</button>
      <button class="card-menu-tags">Edit Tags</button>
    </div>
    <div class="card-menu-secondary"></div>
  `;

  const menuBtn = card.querySelector('.card-menu-btn');
  menuBtn.style.position = 'absolute';
  menuBtn.style.bottom = '18px';
  menuBtn.style.right = '18px';
  menuBtn.style.zIndex = '3';

  const menuPopup = card.querySelector('.card-menu-popup');
  menuPopup.style.position = 'absolute';
  menuPopup.style.bottom = '48px';
  menuPopup.style.right = '18px';

  const secondaryMenu = card.querySelector('.card-menu-secondary');
  secondaryMenu.style.display = 'none';
  secondaryMenu.style.position = 'absolute';
  secondaryMenu.style.bottom = '48px';
  secondaryMenu.style.right = '180px';
  secondaryMenu.style.minWidth = '260px';
  secondaryMenu.style.background = '#23232a';
  secondaryMenu.style.color = '#ececec';
  secondaryMenu.style.borderRadius = '10px';
  secondaryMenu.style.boxShadow = '0 6px 24px rgba(0,0,0,0.22)';
  secondaryMenu.style.padding = '18px 18px 18px 18px';
  secondaryMenu.style.zIndex = '20';
  secondaryMenu.style.flexDirection = 'column';
  secondaryMenu.style.gap = '12px';
  secondaryMenu.style.alignItems = 'flex-start';
  secondaryMenu.style.transition = 'all 0.18s';

  let menuOpen = false;
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuPopup.classList.toggle('open');
    menuOpen = !menuOpen;
    
    if (menuOpen) {
      setTimeout(() => {
        const rect = menuPopup.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        
        if (rect.right > window.innerWidth - 10) {
          menuPopup.style.right = '';
          menuPopup.style.left = '18px';
        } else {
          menuPopup.style.left = '';
          menuPopup.style.right = '18px';
        }
        
        if (rect.bottom > window.innerHeight - 10) {
          menuPopup.style.bottom = '';
          menuPopup.style.top = '48px';
        } else {
          menuPopup.style.top = '';
          menuPopup.style.bottom = '48px';
        }
      }, 0);
      
      document.addEventListener('click', closeMenu, { once: true });
    }
  });
  function closeMenu(e) {
    if (!card.contains(e.target)) {
      menuPopup.classList.remove('open');
      menuOpen = false;
      secondaryMenu.style.display = 'none';
    }
  }

  function openSecondaryMenu(contentHtml, onSubmit, onOpen) {
    secondaryMenu.innerHTML = contentHtml;
    secondaryMenu.style.display = 'flex';
    menuPopup.classList.remove('open');
    menuOpen = false;
    if (onOpen) onOpen(secondaryMenu);
    const submitBtn = secondaryMenu.querySelector('.card-menu-submit');
    if (submitBtn) {
      submitBtn.onclick = (e) => {
        e.stopPropagation();
        onSubmit(secondaryMenu);
      };
    }
    setTimeout(() => {
      const rect = secondaryMenu.getBoundingClientRect();
      
      if (rect.right > window.innerWidth - 10) {
        secondaryMenu.style.right = '';
        secondaryMenu.style.left = '18px';
      } else {
        secondaryMenu.style.left = '';
        secondaryMenu.style.right = '180px';
      }
      
      if (rect.bottom > window.innerHeight - 10) {
        secondaryMenu.style.bottom = '';
        secondaryMenu.style.top = '48px';
      } else {
        secondaryMenu.style.top = '';
        secondaryMenu.style.bottom = '48px';
      }
    }, 0);
    setTimeout(() => {
      document.addEventListener('click', closeSecondaryMenu, { once: true });
    }, 0);
  }
  function closeSecondaryMenu(e) {
    if (!card.contains(e.target)) {
      secondaryMenu.style.display = 'none';
    }
  }

  menuPopup.querySelector('.card-menu-rename').onclick = (e) => {
    e.stopPropagation();
    openSecondaryMenu(`
      <div style='margin-bottom:8px;'>Rename Project (max 64 chars)</div>
      <input class='card-menu-input' type='text' maxlength='64' value="${escapeHtml(cardData.title)}" style='width:100%;padding:8px;border-radius:6px;border:none;background:#18181b;color:#fff;'>
      <button class='card-menu-submit' style='margin-top:10px;width:100%;background:#1DE9B6;color:#18181b;font-weight:600;padding:8px 0;border-radius:6px;border:none;'>Submit</button>
    `, (menu) => {
      const val = menu.querySelector('.card-menu-input').value.trim();
      if (!val) return alert('Title cannot be empty.');
      if (val.length > 64) return alert('Title too long.');
      renameCardWithValue(cardData.$id, val);
      menu.style.display = 'none';
    });
  };
  menuPopup.querySelector('.card-menu-delete').onclick = (e) => {
    e.stopPropagation();
    openSecondaryMenu(`
      <div style='margin-bottom:8px;'>Are you sure you want to delete this card?</div>
      <button class='card-menu-submit' style='width:100%;background:#D6421E;color:#fff;font-weight:600;padding:8px 0;border-radius:6px;border:none;'>Delete</button>
    `, () => {
      deleteCard(cardData.$id);
      secondaryMenu.style.display = 'none';
    });
  };
  menuPopup.querySelector('.card-menu-visibility').onclick = (e) => {
    e.stopPropagation();
    openSecondaryMenu(`
      <div style='margin-bottom:8px;'>Update Visibility</div>
      <select class='card-menu-input' style='width:100%;padding:8px;border-radius:6px;border:none;background:#18181b;color:#fff;'>
        <option value='public' ${cardData.visibility === 'public' ? 'selected' : ''}>Public</option>
        <option value='private' ${cardData.visibility === 'private' ? 'selected' : ''}>Private</option>
        <option value='unlisted' ${cardData.visibility === 'unlisted' ? 'selected' : ''}>Unlisted</option>
      </select>
      <button class='card-menu-submit' style='margin-top:10px;width:100%;background:#1DE9B6;color:#18181b;font-weight:600;padding:8px 0;border-radius:6px;border:none;'>Submit</button>
    `, (menu) => {
      const val = menu.querySelector('.card-menu-input').value;
      updateCardVisibilityWithValue(cardData.$id, val);
      menu.style.display = 'none';
    });
  };
  menuPopup.querySelector('.card-menu-description').onclick = (e) => {
    e.stopPropagation();
    openSecondaryMenu(`
      <div style='margin-bottom:8px;'>Edit Description (max 100 chars)</div>
      <textarea class='card-menu-input' maxlength='100' style='width:100%;padding:8px;border-radius:6px;border:none;background:#18181b;color:#fff;resize:vertical;'>${escapeHtml(cardData.description)}</textarea>
      <div class='desc-char-counter' style='font-size:0.95em;color:#1DE9B6;text-align:right;margin-top:2px;'>${cardData.description.length}/100</div>
      <button class='card-menu-submit' style='margin-top:10px;width:100%;background:#1DE9B6;color:#18181b;font-weight:600;padding:8px 0;border-radius:6px;border:none;'>Submit</button>
    `, (menu) => {
      const val = menu.querySelector('.card-menu-input').value.trim();
      if (!val) return alert('Description cannot be empty.');
      if (val.length > 100) return alert('Description too long.');
      updateCardDescriptionWithValue(cardData.$id, val);
      menu.style.display = 'none';
    }, (menu) => {
      const textarea = menu.querySelector('.card-menu-input');
      const counter = menu.querySelector('.desc-char-counter');
      textarea.addEventListener('input', () => {
        counter.textContent = textarea.value.length + '/100';
        if (textarea.value.length > 100) {
          counter.style.color = '#D6421E';
        } else {
          counter.style.color = '#1DE9B6';
        }
      });
    });
  };
  menuPopup.querySelector('.card-menu-tags').onclick = async (e) => {
    e.stopPropagation();
    const tagElems = document.querySelectorAll('#userTags .sidebar-tag:not(.all-tag)');
    const allTags = Array.from(tagElems).map(el => el.textContent.trim());
    const tagColorMap = {};
    tagElems.forEach(el => {
      const style = window.getComputedStyle(el);
      const colorAttr = el.getAttribute('data-color');
      tagColorMap[el.textContent.trim()] = colorAttr || '1';
    });
    const cardTags = tagTexts.map(t => t.trim());
    openSecondaryMenu(`
      <div style='margin-bottom:8px;'>Edit Tags (max 10)</div>
      <div class='card-menu-tags-list' style='display:flex;flex-wrap:wrap;gap:8px;'></div>
      <div class='tag-count-warning' style='font-size:0.95em;color:#1DE9B6;text-align:right;margin-top:2px;'>${cardTags.length}/10</div>
      <button class='card-menu-submit' style='width:100%;background:#1DE9B6;color:#18181b;font-weight:600;padding:8px 0;border-radius:6px;border:none;'>Submit</button>
    `, (menu) => {
      const selected = Array.from(menu.querySelectorAll('.card-menu-tag.selected')).map(el => el.textContent.trim());
      const selectedColors = selected.map(tag => tagColorMap[tag] || '1');
      if (selected.length > 10) return alert('Maximum 10 tags allowed.');
      updateCardTagsWithValue(cardData.$id, selected, selectedColors);
      menu.style.display = 'none';
    }, (menu) => {
      const tagList = menu.querySelector('.card-menu-tags-list');
      const countWarning = menu.querySelector('.tag-count-warning');
      allTags.forEach(tag => {
        const tagDiv = document.createElement('div');
        tagDiv.textContent = tag;
        tagDiv.className = 'card-menu-tag';
        if (cardTags.includes(tag)) tagDiv.classList.add('selected');
        tagDiv.onclick = () => {
          tagDiv.classList.toggle('selected');
          const selectedCount = menu.querySelectorAll('.card-menu-tag.selected').length;
          countWarning.textContent = selectedCount + '/10';
          if (selectedCount > 10) {
            tagDiv.classList.remove('selected');
            countWarning.style.color = '#D6421E';
            alert('Maximum 10 tags allowed.');
          } else {
            countWarning.style.color = '#1DE9B6';
          }
        };
        tagList.appendChild(tagDiv);
      });
    });
  };

  const titleElement = card.querySelector('.card-title');
  const updateTitleSize = () => {
    const width = titleElement.scrollWidth;
    titleElement.style.setProperty('--content-width', width);
  };
  

  setTimeout(updateTitleSize, 0);
  

  card.addEventListener('click', (e) => {
    if (
      e.target.classList.contains('card-menu-btn') ||
      e.target.closest('.card-menu-popup') ||
      e.target.closest('.card-menu-secondary')
    ) {
      e.stopPropagation();
      return;
    }
    if (e.target.tagName === 'BUTTON') return;
    if (!isOwner) return; 
    window.location.href = `editor.html?projectId=${encodeURIComponent(cardData.$id)}`;
  });

  const previewDiv = card.querySelector('.card-preview');
  previewDiv.style.display = 'flex';
  previewDiv.style.alignItems = 'center';
  previewDiv.style.justifyContent = 'center';
  previewDiv.style.position = 'relative';
  previewDiv.style.height = '';
  let previewLoaded = false;
  async function loadPreview() {
    if (previewLoaded) return;
    previewLoaded = true;
    const CODE_COLLECTION_ID = '682215d200201cb95f05';
    try {
      const codeDoc = await databases.getDocument(DATABASE_ID, CODE_COLLECTION_ID, cardData.$id);
      const html = codeDoc.html_code || '';
      const css = codeDoc.css_code || '';
      const js = codeDoc.js_code || '';
      const isFullHTML = html.toLowerCase().includes('<!doctype') || html.toLowerCase().includes('<html');
      const consoleOverrideScript = `
        <script type=\"text/javascript\">\nif (!window._consoleOverridden) {\nwindow._consoleOverridden = true;\nwindow._originalConsole = {\nlog: console.log,\nerror: console.error,\nwarn: console.warn,\ninfo: console.info\n};\nfunction sendToParent(type, ...args) {\nwindow.parent.postMessage({type: 'console', method: type, args: args.map(arg => {if (typeof arg === 'object') {try {return JSON.stringify(arg);} catch (e) {return String(arg);}}return String(arg);})}, '*');}\nconsole.log = (...args) => {window._originalConsole.log.apply(console, args);sendToParent('log', ...args);};\nconsole.error = (...args) => {window._originalConsole.error.apply(console, args);sendToParent('error', ...args);};\nconsole.warn = (...args) => {window._originalConsole.warn.apply(console, args);sendToParent('warn', ...args);};\nconsole.info = (...args) => {window._originalConsole.info.apply(console, args);sendToParent('info', ...args);};}\nwindow.open = () => {};\n<\/script>\n`;
      const userScript = `<script type=\"text/javascript\">\ntry {\n${js}\n} catch(e) {console.error('Preview JS Error:', e);}\n<\/script>`;
      let processedHtml = html;
      if (!isFullHTML) {
        processedHtml = processedHtml.replace(
          /https:\/\/via\.placeholder\.com\/(\d+)x(\d+)/g,
          (match, width, height) => {
            const svgContent = `
              <svg width=\"${width}\" height=\"${height}\" xmlns=\"http://www.w3.org/2000/svg\">\n<rect width=\"100%\" height=\"100%\" fill=\"#ddd\"/>\n<text x=\"50%\" y=\"50%\" font-family=\"Arial\" font-size=\"14\" fill=\"#666\" text-anchor=\"middle\" dy=\".3em\">${width}x${height}</text>\n</svg>\n`;
            return 'data:image/svg+xml;base64,' + btoa(svgContent);
          }
        );
      }
      const content = isFullHTML ? processedHtml : `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset=\"utf-8\">
            <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
            <style type=\"text/css\">${css}</style>
          </head>
          <body>
            ${processedHtml}
            ${consoleOverrideScript}
            ${userScript}
          </body>
        </html>
      `;
      previewDiv.innerHTML = `<div class=\"preview-zoom-wrapper\" style=\"display:flex;align-items:center;justify-content:center;width:100%;height:100%;position:absolute;top:0;left:0;overflow:hidden;\"><iframe style=\"width:640px;height:400px;border:none;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.04);transform-origin:top left;\" sandbox=\"allow-scripts\" loading=\"lazy\"></iframe></div>`;
      const wrapper = previewDiv.querySelector('.preview-zoom-wrapper');
      const iframe = wrapper.querySelector('iframe');
      iframe.srcdoc = content;
      iframe.onload = function() {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          setTimeout(() => {
            const body = doc.body;
            if (!body) return;
            const contentWidth = Math.max(body.scrollWidth, 1);
            const contentHeight = Math.max(body.scrollHeight, 1);
            const scaleX = wrapper.offsetWidth / contentWidth;
            const scaleY = wrapper.offsetHeight / contentHeight;
            const scale = Math.min(scaleX, scaleY, 1);
            iframe.style.transform = `scale(${scale})`;
          }, 60);
        } catch (e) {}
      };
    } catch (e) {
      previewDiv.innerHTML = '<div class="preview-error-text">No Preview Available</div>';
    }
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadPreview();
          obs.unobserve(card);
        }
      });
    }, { threshold: 0.2 });
    observer.observe(card);
  } else {
    card.addEventListener('mouseenter', loadPreview, { once: true });
  }
  return card;
}

function validateInput(input, fieldName) {
  const suspiciousPatterns = [
    { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, message: 'contains script tags' },
    { pattern: /javascript:/gi, message: 'contains javascript code' },
    { pattern: /onerror=/gi, message: 'contains invalid attributes' },
    { pattern: /onload=/gi, message: 'contains invalid attributes' },
    { pattern: /onclick=/gi, message: 'contains invalid attributes' }
  ];

  for (const { pattern, message } of suspiciousPatterns) {
    if (pattern.test(input)) {
      throw new Error(`${fieldName} ${message} which are not allowed`);
    }
  }


  if (!input.trim()) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  return input;
}


async function promptWithValidation(message, defaultValue = '', maxLength = null, fieldName = '') {
  while (true) {
    const value = prompt(message, defaultValue);
    if (value === null) return null; 
    
    const trimmedValue = value.trim();
    
    if (!trimmedValue) {
      alert(`${fieldName || 'This field'} cannot be empty. Please try again.`);
      continue;
    }

    try {
      validateInput(trimmedValue, fieldName);


      if (fieldName === 'Title' && trimmedValue.length > 64) {
        alert('Title must be less than 64 characters. Please try again.');
        continue;
      }












      if (maxLength && trimmedValue.length > maxLength) {
        alert(`${fieldName || 'Input'} too long. Maximum ${maxLength} characters allowed. Please try again.`);
        continue;
      }

      return trimmedValue;












    } catch (error) {
      alert(error.message);
      continue;
    }
  }
}



async function promptForVisibility(defaultValue = false) {
  while (true) {
    const choice = prompt('Make this card public? (y/n):', defaultValue ? 'y' : 'n').toLowerCase();
    if (choice === null) return null;
    if (choice === 'y' || choice === 'n') {
      return choice === 'y';
    }
    alert('Please enter y or n');
  }
}


async function promptForTags(defaultValue = '') {
  while (true) { 
    const tagsInput = prompt('Enter tags (comma-separated, max 10 tags) - at least one tag is required:', defaultValue);
    if (tagsInput === null) return null; 
    
    if (!tagsInput.trim()) {
      alert('At least one tag is required. Please try again.');
      continue;
    }


    const rawTags = tagsInput.split(',');
    const tagTexts = [];
    const invalidTags = [];


    if (rawTags.filter(tag => tag.trim()).length > 10) {
      alert('Maximum 10 tags allowed. Please reduce the number of tags.');
      continue;
    }


    for (const tag of rawTags) {
      const trimmedTag = tag.trim();
      if (!trimmedTag) continue; 

      try {
        if (trimmedTag.length > 20) { 
          invalidTags.push(`"${trimmedTag}" is too long (maximum 20 characters)`);
          continue;
        }




        const validationResult = validateTagContent(trimmedTag);
        if (validationResult.isValid) {
          tagTexts.push(trimmedTag);
        } else {
          invalidTags.push(`"${trimmedTag}" ${validationResult.message}`);
        }
      } catch (error) {
        invalidTags.push(`"${trimmedTag}": ${error.message}`);
      }
    }


















    if (tagTexts.length === 0) {





      let errorMessage = 'At least one valid tag is required.';
      if (invalidTags.length > 0) {
        errorMessage += '\n\nInvalid tags found:\n' + invalidTags.join('\n');
      }



      alert(errorMessage);
      continue; 
    }

    const tagColors = [];

    for (const tagText of tagTexts) {
      while (true) { 
        const colorPrompt = 'Choose a color number for tag "' + tagText + '":\n\n' +
          '1: Green\n2: Blue\n3: Red\n4: Yellow\n5: Purple\n' +
          '6: Orange\n7: Turquoise\n8: Light Gray\n9: Dark Gray\n10: Gold';
        
        const colorChoice = prompt(colorPrompt, '1');
        
        if (colorChoice === null) {
          return null; 
        }

        const colorNumber = parseInt(colorChoice);
        if (isNaN(colorNumber) || colorNumber < 1 || colorNumber > 10) {
          alert('Please enter a number between 1 and 10.');
          continue;
        }

        tagColors.push(colorNumber.toString()); 
        break;
      }
    }

    return {
      tag_Text: tagTexts.map(tag => String(tag).trim()),
      tag_Colors: tagColors  
    };
  }
}


function validateTagContent(tag) {

  const suspiciousPatterns = [
    { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, message: 'contains script tags' },
    { pattern: /javascript:/gi, message: 'contains javascript code' },
    { pattern: /onerror=/gi, message: 'contains invalid attributes' },
    { pattern: /onload=/gi, message: 'contains invalid attributes' },
    { pattern: /onclick=/gi, message: 'contains invalid attributes' }
  ];

  for (const { pattern, message } of suspiciousPatterns) {
    if (pattern.test(tag)) {
      return {
        isValid: false,
        message: message
      };
    }
  }

  return {
    isValid: true,
    message: ''
  };
}


function isValidColor(color) {

  const testDiv = document.createElement('div');
  testDiv.style.color = color;
  return testDiv.style.color !== '';
}

async function renameCard(cardId) {
  try {
    const card = await databases.getDocument(DATABASE_ID, COLLECTION_ID, cardId);
    
    const title = await promptWithValidation('Enter new title:', card.title, 64, 'Title');
    if (!title) return;

    const updatedCard = {
      title: title,
      description: card.description,
      userId: card.userId,
      visibility: card.visibility,
      last_modified: new Date().toISOString(),
      tag_Text: card.tag_Text,
      tag_Colors: card.tag_Colors
    };

    await databases.updateDocument(DATABASE_ID, COLLECTION_ID, cardId, updatedCard);
    const user = await window.account.get();
    await loadCards(user.$id);
  } catch (error) {
    console.error('Error renaming card:', error);
    if (error.code === 401) {
      alert('You do not have permission to rename this card.');
    } else {
      const errorMessage = error.message.includes('title has invalid type')
        ? 'Title must be less than 64 characters and cannot be empty.'
        : 'Failed to rename card. Please try again.';
      alert(errorMessage);
    }
  }
}


async function deleteCard(cardId) {
  if (!confirm('Are you sure you want to delete this card?')) return;
  
  try {
    await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, cardId);
    const user = await window.account.get();
    await loadCards(user.$id);
  } catch (error) {
    console.error('Error deleting card:', error);
    if (error.code === 401) {
      alert('You do not have permission to delete this card.');
    } else {
      alert('Failed to delete card. Please try again.');
    }
  }
}


function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <h3>${project.title}</h3>
        <p>${project.description}</p>
    `;
    

    card.addEventListener('click', () => {
        window.location.href = `editor.html?projectId=${project.$id}`;
    });
    
    return card;
} 

function updateCardVisibility(cardId) {
  alert('Update visibility for card: ' + cardId);
}
function updateCardDescription(cardId) {
  alert('Edit description for card: ' + cardId);
}
function updateCardTags(cardId) {
  alert('Edit tags for card: ' + cardId);
}

async function renameCardWithValue(cardId, newTitle) {
  try {
    await databases.updateDocument(
      DATABASE_ID,
      COLLECTION_ID,
      cardId,
      { title: newTitle }
    );
    const user = await window.account.get();
    await loadCards(user.$id);
  } catch (error) {
    alert('Failed to rename card.');
  }
}
async function updateCardVisibilityWithValue(cardId, newVisibility) {
  try {
    await databases.updateDocument(
      DATABASE_ID,
      COLLECTION_ID,
      cardId,
      { visibility: newVisibility }
    );
    const user = await window.account.get();
    await loadCards(user.$id);
  } catch (error) {
    alert('Failed to update visibility.');
  }
}
async function updateCardDescriptionWithValue(cardId, newDescription) {
  try {
    await databases.updateDocument(
      DATABASE_ID,
      COLLECTION_ID,
      cardId,
      { description: newDescription }
    );
    const user = await window.account.get();
    await loadCards(user.$id);
  } catch (error) {
    alert('Failed to update description.');
  }
}
async function updateCardTagsWithValue(cardId, newTags, newColors) {
  try {
    const updatedCard = {
      tag_Text: Array.isArray(newTags) ? newTags.join(',') : '',
      tag_Colors: Array.isArray(newColors) ? newColors.join(',') : ''
    };
    console.log('Updating card with:', updatedCard);
    await databases.updateDocument(DATABASE_ID, COLLECTION_ID, cardId, updatedCard);
    const user = await window.account.get();
    await loadCards(user.$id);
  } catch (error) {
    alert('Failed to update tags.');
  }
} 
