class Application {
    constructor() {
        this.sessionId = null;
        this.boundingBox = null;
        this.currentData = null;
        
        this.renderer = null;
        this.controls = null;
        this.cuttingManager = null;
        this.contourManager = null;
        
        this._init();
    }

    _init() {
        this._initializeRenderers();
        this._bindUIEvents();
        this._bindParameterUpdates();
    }

    _initializeRenderers() {
        this.renderer = new ThreeRenderer('three-canvas');
        this.controls = new OrbitControls(this.renderer);
        this.cuttingManager = new CuttingManager(this.renderer);
        this.contourManager = new ContourManager(this.renderer);
    }

    _bindUIEvents() {
        const fileInput = document.getElementById('las-file');
        const uploadBtn = document.getElementById('upload-btn');
        const simplifyBtn = document.getElementById('simplify-btn');
        const cutBtn = document.getElementById('cut-btn');
        const resetCutBtn = document.getElementById('reset-cut-btn');
        const crossSectionBtn = document.getElementById('cross-section-btn');
        const closeSectionBtn = document.getElementById('close-section-btn');
        const contourBtn = document.getElementById('contour-btn');
        const hideContourBtn = document.getElementById('hide-contour-btn');
        const exportJsonBtn = document.getElementById('export-json-btn');
        const screenshotBtn = document.getElementById('screenshot-btn');
        
        const applyAttrBtn = document.getElementById('apply-attr-btn');
        const resetAttrBtn = document.getElementById('reset-attr-btn');
        const attributeSelect = document.getElementById('attribute-select');
        const measureMode = document.getElementById('measure-mode');
        const clearMeasurements = document.getElementById('clear-measurements');

        fileInput.addEventListener('change', (e) => {
            uploadBtn.disabled = !e.target.files.length;
        });

        uploadBtn.addEventListener('click', () => this._uploadFile());
        simplifyBtn.addEventListener('click', () => this._simplifyModel());
        cutBtn.addEventListener('click', () => this._performCut());
        resetCutBtn.addEventListener('click', () => this._resetCut());
        crossSectionBtn.addEventListener('click', () => this._generateCrossSection());
        closeSectionBtn.addEventListener('click', () => this._closeCrossSection());
        contourBtn.addEventListener('click', () => this._generateContours());
        hideContourBtn.addEventListener('click', () => this._hideContours());
        exportJsonBtn.addEventListener('click', () => this._exportJson());
        screenshotBtn.addEventListener('click', () => this._takeScreenshot());
        
        applyAttrBtn.addEventListener('click', () => this._applyAttributeColors());
        resetAttrBtn.addEventListener('click', () => this._resetAttributeColors());
        attributeSelect.addEventListener('change', (e) => this._onAttributeSelect(e));
        measureMode.addEventListener('change', (e) => this._onMeasureModeChange(e));
        clearMeasurements.addEventListener('click', () => this._clearMeasurements());

        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _bindParameterUpdates() {
        const voxelSizeSlider = document.getElementById('voxel-size');
        const sampleRatioSlider = document.getElementById('sample-ratio');
        const cutPositionSlider = document.getElementById('cut-position');
        const contourLevelsSlider = document.getElementById('contour-levels');
        const gridResolutionSlider = document.getElementById('grid-resolution');

        voxelSizeSlider.addEventListener('input', (e) => {
            document.getElementById('voxel-size-val').textContent = e.target.value;
        });

        sampleRatioSlider.addEventListener('input', (e) => {
            document.getElementById('sample-ratio-val').textContent = e.target.value;
        });

        cutPositionSlider.addEventListener('input', (e) => {
            document.getElementById('cut-pos-val').textContent = e.target.value;
            this._updateCutPlanePreview();
        });

        contourLevelsSlider.addEventListener('input', (e) => {
            document.getElementById('contour-levels-val').textContent = e.target.value;
        });

        gridResolutionSlider.addEventListener('input', (e) => {
            document.getElementById('grid-res-val').textContent = e.target.value;
        });
    }

    async _uploadFile() {
        const fileInput = document.getElementById('las-file');
        const file = fileInput.files[0];
        
        if (!file) {
            this._showToast('请选择 LAS 文件', 'error');
            return;
        }

        this._showLoading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.sessionId = result.session_id;
                this.currentData = result.data;
                this.boundingBox = result.bounding_box;
                
                this._updateUIAfterUpload(file.name, result.data);
                this._renderPointCloud(result.data);
                this._updateCutSliders(result.bounding_box);
                
                this._showToast('文件上传成功', 'success');
            } else {
                this._showToast(result.error || '文件上传失败', 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this._showToast('文件上传错误: ' + error.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    _updateUIAfterUpload(filename, data) {
        document.getElementById('file-info').textContent = filename;
        document.getElementById('stats-panel').style.display = 'block';
        document.getElementById('total-points').textContent = data.total_points.toLocaleString();
        document.getElementById('sampled-points').textContent = data.sampled_points.toLocaleString();

        document.getElementById('simplify-btn').disabled = false;
        document.getElementById('cut-btn').disabled = false;
        document.getElementById('reset-cut-btn').disabled = false;
        document.getElementById('cross-section-btn').disabled = false;
        document.getElementById('contour-btn').disabled = false;
        document.getElementById('export-json-btn').disabled = false;
        document.getElementById('screenshot-btn').disabled = false;
        
        document.getElementById('attribute-select').disabled = false;
        document.getElementById('colormap-select').disabled = false;
        document.getElementById('apply-attr-btn').disabled = false;
        document.getElementById('reset-attr-btn').disabled = false;
        
        this._loadAttributes();
    }

    async _loadAttributes() {
        if (!this.sessionId) return;
        
        try {
            const response = await fetch(`/api/attributes/${this.sessionId}`);
            const result = await response.json();
            
            if (result.success) {
                this._populateAttributeSelect(result.attributes);
            }
        } catch (error) {
            console.error('Load attributes error:', error);
        }
    }

    _populateAttributeSelect(attributes) {
        const select = document.getElementById('attribute-select');
        select.innerHTML = '';
        
        for (const attr of attributes) {
            const option = document.createElement('option');
            option.value = attr.name;
            option.textContent = `${attr.name} (范围: ${attr.min.toFixed(2)} - ${attr.max.toFixed(2)})`;
            option.dataset.stats = JSON.stringify(attr);
            select.appendChild(option);
        }
    }

    _onAttributeSelect(event) {
        const option = event.target.selectedOptions[0];
        if (!option) return;
        
        try {
            const stats = JSON.parse(option.dataset.stats);
            this._updateAttributeInfo(stats);
        } catch (e) {
            console.error('Parse stats error:', e);
        }
    }

    _updateAttributeInfo(stats) {
        const infoPanel = document.getElementById('attr-info');
        infoPanel.style.display = 'block';
        
        document.getElementById('attr-min').textContent = stats.min.toFixed(4);
        document.getElementById('attr-max').textContent = stats.max.toFixed(4);
        document.getElementById('attr-mean').textContent = stats.mean.toFixed(4);
    }

    async _applyAttributeColors() {
        if (!this.sessionId) return;
        
        const attrSelect = document.getElementById('attribute-select');
        const colormapSelect = document.getElementById('colormap-select');
        const invertCheckbox = document.getElementById('invert-colormap');
        
        if (!attrSelect.value) {
            this._showToast('请选择属性', 'error');
            return;
        }
        
        this._showLoading(true);
        
        try {
            const response = await fetch('/api/attribute-colors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    attr_name: attrSelect.value,
                    colormap: colormapSelect.value,
                    invert: invertCheckbox.checked
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                if (this.renderer.pointCloud) {
                    const colors = result.colors;
                    const colorArray = new Float32Array(colors.length * 3);
                    
                    for (let i = 0; i < colors.length; i++) {
                        colorArray[i * 3] = colors[i][0];
                        colorArray[i * 3 + 1] = colors[i][1];
                        colorArray[i * 3 + 2] = colors[i][2];
                    }
                    
                    this.renderer.pointCloud.geometry.setAttribute(
                        'color',
                        new THREE.BufferAttribute(colorArray, 3)
                    );
                    this.renderer.pointCloud.geometry.attributes.color.needsUpdate = true;
                }
                
                this._drawColorbar(result.colormap, result.min, result.max);
                this._showToast(`属性 "${result.attribute}" 已应用`, 'success');
            } else {
                this._showToast(result.error || '属性颜色映射失败', 'error');
            }
        } catch (error) {
            console.error('Attribute colors error:', error);
            this._showToast('属性颜色映射错误: ' + error.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    async _resetAttributeColors() {
        if (!this.sessionId) return;
        
        try {
            const response = await fetch('/api/reset-colors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: this.sessionId })
            });
            
            const result = await response.json();
            
            if (result.success && this.renderer.pointCloud) {
                const colors = result.colors;
                const colorArray = new Float32Array(colors.length * 3);
                
                for (let i = 0; i < colors.length; i++) {
                    colorArray[i * 3] = colors[i][0];
                    colorArray[i * 3 + 1] = colors[i][1];
                    colorArray[i * 3 + 2] = colors[i][2];
                }
                
                this.renderer.pointCloud.geometry.setAttribute(
                    'color',
                    new THREE.BufferAttribute(colorArray, 3)
                );
                this.renderer.pointCloud.geometry.attributes.color.needsUpdate = true;
            }
            
            document.getElementById('colorbar-container').style.display = 'none';
            this._showToast('颜色已重置', 'success');
        } catch (error) {
            console.error('Reset colors error:', error);
            this._showToast('重置颜色错误: ' + error.message, 'error');
        }
    }

    _drawColorbar(colormap, minVal, maxVal) {
        const container = document.getElementById('colorbar-container');
        const canvas = document.getElementById('colorbar-canvas');
        const ctx = canvas.getContext('2d');
        
        container.style.display = 'flex';
        
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        const stops = this._getColormapStops(colormap);
        
        for (const [pos, color] of stops) {
            gradient.addColorStop(pos, color);
        }
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        document.getElementById('colorbar-max').textContent = maxVal.toFixed(2);
        document.getElementById('colorbar-min').textContent = minVal.toFixed(2);
    }

    _getColormapStops(colormap) {
        const colormaps = {
            viridis: [
                [0, '#440154'],
                [0.25, '#31688e'],
                [0.5, '#21918c'],
                [0.75, '#35b779'],
                [1, '#fde725']
            ],
            plasma: [
                [0, '#0d0887'],
                [0.25, '#7e03a8'],
                [0.5, '#f89540'],
                [0.75, '#f0f921'],
                [1, '#f0f921']
            ],
            jet: [
                [0, '#000080'],
                [0.25, '#0080ff'],
                [0.5, '#80ff80'],
                [0.75, '#ff8000'],
                [1, '#800000']
            ],
            rainbow: [
                [0, '#ff0000'],
                [0.17, '#ffff00'],
                [0.33, '#00ff00'],
                [0.5, '#00ffff'],
                [0.67, '#0000ff'],
                [0.83, '#8000ff'],
                [1, '#ff0080']
            ],
            terrain: [
                [0, '#0000ff'],
                [0.25, '#00ffff'],
                [0.5, '#00ff00'],
                [0.75, '#808000'],
                [1, '#a0522d']
            ],
            reds: [
                [0, '#ffffff'],
                [1, '#ff0000']
            ],
            greens: [
                [0, '#ffffff'],
                [1, '#00ff00']
            ],
            blues: [
                [0, '#ffffff'],
                [1, '#0000ff']
            ]
        };
        
        return colormaps[colormap] || colormaps.viridis;
    }

    _onMeasureModeChange(event) {
        const mode = event.target.value;
        this.cuttingManager.setMeasureMode(mode);
        
        if (mode === 'none') {
            document.getElementById('measurements-info').style.display = 'none';
        }
    }

    _clearMeasurements() {
        this.cuttingManager.clearMeasurements();
        this._showToast('测量已清除', 'success');
    }

    _updateCutSliders(boundingBox) {
        const minY = boundingBox.min[1];
        const maxY = boundingBox.max[1];
        const centerY = (minY + maxY) / 2;
        
        const slider = document.getElementById('cut-position');
        slider.min = minY;
        slider.max = maxY;
        slider.value = centerY;
        slider.step = (maxY - minY) / 100;
        document.getElementById('cut-pos-val').textContent = centerY.toFixed(2);
    }

    _renderPointCloud(data) {
        this.renderer.loadPointCloud(data.points, data.colors);
        
        if (this.renderer.center) {
            this.controls.setTarget(
                this.renderer.center[0],
                this.renderer.center[2],
                this.renderer.center[1]
            );
        }
    }

    async _simplifyModel() {
        if (!this.sessionId) return;

        const method = document.getElementById('simplify-method').value;
        const voxelSize = parseFloat(document.getElementById('voxel-size').value);
        const sampleRatio = parseFloat(document.getElementById('sample-ratio').value);

        let params = {};
        if (method === 'voxel') {
            params.voxel_size = voxelSize;
        } else if (method === 'random') {
            params.sample_ratio = sampleRatio;
        } else if (method === 'uniform') {
            params.step = Math.ceil(1 / sampleRatio);
        }

        this._showLoading(true);

        try {
            const response = await fetch('/api/simplify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    method: method,
                    params: params
                })
            });

            const result = await response.json();

            if (result.success) {
                this.renderer.updatePointCloud(result.data.points, result.data.colors);
                
                const reduction = (result.stats.reduction_ratio * 100).toFixed(1);
                this._showToast(`模型简化完成: 减少 ${reduction}%`, 'success');
            } else {
                this._showToast(result.error || '简化失败', 'error');
            }
        } catch (error) {
            console.error('Simplify error:', error);
            this._showToast('简化错误: ' + error.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    async _performCut() {
        if (!this.sessionId) return;

        const normalX = parseFloat(document.getElementById('normal-x').value);
        const normalY = parseFloat(document.getElementById('normal-y').value);
        const normalZ = parseFloat(document.getElementById('normal-z').value);
        const position = parseFloat(document.getElementById('cut-position').value);

        const planeNormal = [normalX, normalY, normalZ];
        const planePoint = [
            this.boundingBox.center[0],
            position,
            this.boundingBox.center[2]
        ];

        this._showLoading(true);

        try {
            const result = await this.cuttingManager.performCut(
                this.sessionId,
                planePoint,
                planeNormal
            );

            this.cuttingManager.applyCut(result, true);
            this.renderer.addCutPlane(planePoint, planeNormal);

            this._showToast('剖切完成', 'success');
        } catch (error) {
            console.error('Cut error:', error);
            this._showToast('剖切错误: ' + error.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    _updateCutPlanePreview() {
        if (!this.sessionId || !this.boundingBox) return;

        const normalX = parseFloat(document.getElementById('normal-x').value);
        const normalY = parseFloat(document.getElementById('normal-y').value);
        const normalZ = parseFloat(document.getElementById('normal-z').value);
        const position = parseFloat(document.getElementById('cut-position').value);

        const planeNormal = [normalX, normalY, normalZ];
        const planePoint = [
            this.boundingBox.center[0],
            position,
            this.boundingBox.center[2]
        ];

        this.renderer.addCutPlane(planePoint, planeNormal);
    }

    _resetCut() {
        this.cuttingManager.reset();
        this.renderer.removeCutPlane();
        this._showToast('已重置剖切', 'success');
    }

    async _generateCrossSection() {
        if (!this.sessionId) return;

        const normalX = parseFloat(document.getElementById('normal-x').value);
        const normalY = parseFloat(document.getElementById('normal-y').value);
        const normalZ = parseFloat(document.getElementById('normal-z').value);
        const position = parseFloat(document.getElementById('cut-position').value);

        const planeNormal = [normalX, normalY, normalZ];
        const planePoint = [
            this.boundingBox.center[0],
            position,
            this.boundingBox.center[2]
        ];

        this._showLoading(true);

        try {
            const section = await this.cuttingManager.generateCrossSection(
                this.sessionId,
                planePoint,
                planeNormal
            );

            if (section) {
                this.cuttingManager.currentSection = section;
                document.getElementById('cross-section-panel').style.display = 'block';
                
                setTimeout(() => {
                    this.cuttingManager.renderCrossSection(section, 'cross-section-canvas');
                    this.cuttingManager._bindMeasureEvents();
                    this.cuttingManager.setMeasureMode('none');
                }, 100);

                this._showToast('剖面图生成完成，可进行距离和角度测量', 'success');
            } else {
                this._showToast('无法生成剖面图', 'error');
            }
        } catch (error) {
            console.error('Cross-section error:', error);
            this._showToast('剖面图错误: ' + error.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    _closeCrossSection() {
        document.getElementById('cross-section-panel').style.display = 'none';
    }

    async _generateContours() {
        if (!this.sessionId) return;

        const numLevels = parseInt(document.getElementById('contour-levels').value);
        const gridResolution = parseInt(document.getElementById('grid-resolution').value);
        const smooth = document.getElementById('smooth-contour').checked;

        this._showLoading(true);

        try {
            const result = await this.contourManager.calculateContours(
                this.sessionId,
                gridResolution,
                numLevels,
                smooth,
                1.0
            );

            this.contourManager.showContours();
            
            document.getElementById('hide-contour-btn').disabled = false;

            const stats = this.contourManager.getStats();
            this._showToast(`等值线生成完成: ${stats.numContours} 条`, 'success');
        } catch (error) {
            console.error('Contour error:', error);
            this._showToast('等值线错误: ' + error.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    _hideContours() {
        this.contourManager.hideContours();
        document.getElementById('hide-contour-btn').disabled = true;
        this._showToast('等值线已隐藏', 'success');
    }

    async _exportJson() {
        if (!this.sessionId) return;

        try {
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    type: 'json'
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'geological_model_export.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                this._showToast('JSON 导出成功', 'success');
            } else {
                this._showToast('JSON 导出失败', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            this._showToast('导出错误: ' + error.message, 'error');
        }
    }

    _takeScreenshot() {
        const dataUrl = this.renderer.takeScreenshot();
        
        const link = document.createElement('a');
        link.download = 'geological_model_screenshot.png';
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this._showToast('截图已保存', 'success');
    }

    _showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.classList.add('show');
        } else {
            loading.classList.remove('show');
        }
    }

    _showToast(message, type = 'info') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.borderColor = type === 'error' ? '#ff4444' : 
                                   type === 'success' ? '#44ff44' : '#00d4ff';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Application();
});
