document.addEventListener('DOMContentLoaded', () => {
    
    /* =========================================
       NAVIGATION (EXISTING)
       ========================================= */
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });

        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    /* =========================================
       BACKEND WIRING & API LOGIC
       ========================================= */
    
    // UI Selectors
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const uploadContent = document.querySelector('.upload-content');
    
    const resetBtn = document.getElementById('reset-btn');
    const generateBtn = document.getElementById('generate-btn');
    const downloadBtn = document.getElementById('download-btn');
    
    const resultPlaceholder = document.querySelector('.result-placeholder');
    const loadingState = document.getElementById('loading-state');
    const resultFinal = document.getElementById('result-final');

    // Global State
    let currentUploadedUrl = null;
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2'; // Hardcoded for demo
    
    // --- UTILITY FUNCTIONS ---

    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function updateStatus(text) {
        // Find or create status text element inside loading state
        let statusEl = loadingState.querySelector('.status-text');
        if (!statusEl) {
            statusEl = document.createElement('p');
            statusEl.className = 'status-text mt-4 text-gray-400 text-sm font-medium animate-pulse';
            loadingState.appendChild(statusEl);
        }
        statusEl.textContent = text;
    }

    // --- API FUNCTIONS ---

    // 1. Upload File (Immediate)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        const fileName = 'media/' + uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL
        const signedUrlResponse = await fetch(
            'https://core.faceswapper.ai/media/get-upload-url?fileName=' + encodeURIComponent(fileName) + '&projectId=dressr',
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file to storage');
        }
        
        // Step 3: Return final CDN URL
        const downloadUrl = 'https://assets.dressr.ai/' + fileName;
        return downloadUrl;
    }

    // 2. Submit Generation Job
    async function submitImageGenJob(imageUrl) {
        const endpoint = 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        const body = {
            model: 'image-effects',
            toolType: 'image-effects',
            effectId: 'photoToVectorArt',
            imageUrl: imageUrl,
            userId: USER_ID,
            removeWatermark: true,
            isPrivate: true
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // 3. Poll Job Status
    async function pollJobStatus(jobId) {
        const baseUrl = 'https://api.chromastudio.ai/image-gen';
        const POLL_INTERVAL = 2000;
        const MAX_POLLS = 60; // 2 minutes timeout
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Status check failed');
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            updateStatus(`PROCESSING... (${Math.round((polls/MAX_POLLS)*100)}%)`);
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Operation timed out. Please try again.');
    }

    // --- UI HELPER FUNCTIONS ---

    function showLoading() {
        resultPlaceholder.classList.add('hidden');
        if (resultFinal) resultFinal.classList.add('hidden');
        loadingState.classList.remove('hidden');
        if (generateBtn) generateBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;
    }

    function hideLoading() {
        loadingState.classList.add('hidden');
        if (generateBtn) generateBtn.disabled = false;
    }

    function showPreview(url) {
        previewImage.src = url;
        uploadContent.classList.add('hidden');
        previewContainer.classList.remove('hidden');
    }

    function showResultMedia(url) {
        if (!resultFinal) return;
        
        resultFinal.classList.remove('hidden');
        resultFinal.style.display = 'block';
        
        // IMPORTANT: Set crossOrigin before setting src for canvas operations later
        resultFinal.crossOrigin = 'anonymous';
        resultFinal.src = url;
        
        // Remove any mock filters that might have been present in CSS
        resultFinal.style.filter = 'none'; 
        
        // Store URL for download button
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.disabled = false;
            downloadBtn.style.display = 'inline-block';
        }
    }

    function showError(message) {
        alert(message);
        hideLoading();
        // Return to placeholder state if no result yet
        if (!resultFinal || resultFinal.classList.contains('hidden')) {
            resultPlaceholder.classList.remove('hidden');
        }
    }

    function resetUI() {
        currentUploadedUrl = null;
        
        // Reset Inputs
        fileInput.value = '';
        
        // Reset Preview Area
        previewImage.src = '';
        uploadContent.classList.remove('hidden');
        previewContainer.classList.add('hidden');
        
        // Reset Result Area
        resultPlaceholder.classList.remove('hidden');
        loadingState.classList.add('hidden');
        if (resultFinal) {
            resultFinal.classList.add('hidden');
            resultFinal.src = '';
        }
        
        // Reset Buttons
        if (generateBtn) generateBtn.disabled = true;
        if (downloadBtn) {
            downloadBtn.disabled = true;
            delete downloadBtn.dataset.url;
        }
    }

    // --- EVENT HANDLERS ---

    // 1. File Selection Handler
    async function handleFileSelect(file) {
        if (!file) return;
        
        // Reset previous results
        if (resultFinal) resultFinal.classList.add('hidden');
        resultPlaceholder.classList.remove('hidden');
        if (downloadBtn) downloadBtn.disabled = true;

        try {
            showLoading();
            updateStatus('UPLOADING IMAGE...');
            
            // Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show preview
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            hideLoading();
            
            // Enable generate
            if (generateBtn) generateBtn.disabled = false;
            
        } catch (error) {
            console.error(error);
            showError('Upload failed: ' + error.message);
        }
    }

    // 2. Generate Button Handler
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please upload an image first.');
            return;
        }

        try {
            showLoading();
            updateStatus('INITIALIZING JOB...');
            
            // Submit Job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('PROCESSING ARTWORK...');
            
            // Poll for result
            const result = await pollJobStatus(jobData.jobId);
            
            // Extract URL (handle both new and old API schemas)
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.image || resultItem?.video;
            
            if (!resultUrl) {
                throw new Error('Output URL missing from response');
            }
            
            // Show Result
            showResultMedia(resultUrl);
            hideLoading();
            
        } catch (error) {
            console.error(error);
            showError('Generation failed: ' + error.message);
        }
    }

    // --- EVENT LISTENERS ---

    // File Input & Drag/Drop
    if (dropZone) {
        dropZone.addEventListener('click', (e) => {
            if (e.target !== resetBtn) fileInput.click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files[0]) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    // Buttons
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetUI();
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Download Button - Robust Implementation (Fetch -> Canvas -> Fallback)
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            try {
                // Method 1: Fetch as Blob (Best for file integrity)
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) throw new Error('Network fetch failed');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'vector-art-' + generateNanoId(8) + '.png'; // Assuming png output
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.warn('Direct fetch download failed, trying canvas fallback...', err);
                
                // Method 2: Canvas Fallback (Works if CORS headers on image allow it)
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.complete && img.naturalWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        
                        // Draw image to canvas
                        ctx.drawImage(img, 0, 0);
                        
                        // Convert to blob
                        canvas.toBlob((blob) => {
                            if (blob) {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = 'vector-art-' + generateNanoId(8) + '.png';
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
                            } else {
                                throw new Error('Canvas blob creation failed');
                            }
                        }, 'image/png');
                    } else {
                        throw new Error('Image not loaded or invalid');
                    }
                } catch (canvasErr) {
                    console.error('Canvas download failed:', canvasErr);
                    
                    // Method 3: Final Fallback
                    alert('Download failed due to browser security settings.\n\nThe image will open in a new tab. Please right-click it and select "Save Image As...".');
                    window.open(url, '_blank');
                }
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    /* =========================================
       FAQ ACCORDION (EXISTING)
       ========================================= */
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isActive = question.classList.contains('active');
            
            faqQuestions.forEach(q => {
                q.classList.remove('active');
                q.nextElementSibling.style.maxHeight = null;
            });
            
            if (!isActive) {
                question.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    /* =========================================
       MODALS (EXISTING)
       ========================================= */
    const modalTriggers = document.querySelectorAll('[data-modal-target]');
    const modalClosers = document.querySelectorAll('[data-modal-close]');
    
    modalTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = trigger.getAttribute('data-modal-target') + '-modal';
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }
        });
    });

    modalClosers.forEach(closer => {
        closer.addEventListener('click', () => {
            const modal = closer.closest('.modal');
            closeModal(modal);
        });
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });

    function closeModal(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    /* =========================================
       SCROLL ANIMATIONS (EXISTING)
       ========================================= */
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.hero-content, .section-header').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        .visible { opacity: 1 !important; transform: translateY(0) !important; }
    `;
    document.head.appendChild(styleSheet);
});