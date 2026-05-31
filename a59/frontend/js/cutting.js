class CuttingManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.isCutting = false;
        this.cutResult = null;
        this.currentSection = null;
        this.measureMode = 'none';
        this.measurePoints = [];
        this.measurements = [];
        this.isDrawing = false;
        this.canvas = null;
    }

    async performCut(sessionId, planePoint, planeNormal, tolerance = 0.1) {
        try {
            const response = await fetch('/api/cut', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    cut_type: 'plane',
                    plane_point: planePoint,
                    plane_normal: planeNormal,
                    tolerance: tolerance
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.cutResult = result.result;
                this.isCutting = true;
                return result.result;
            } else {
                throw new Error(result.error || 'Cut failed');
            }
        } catch (error) {
            console.error('Cut error:', error);
            throw error;
        }
    }

    applyCut(result, keepAbove = true) {
        if (!result) return;
        
        const points = keepAbove ? result.above.points : result.below.points;
        const colors = keepAbove ? result.above.colors : result.below.colors;
        
        if (points.length > 0) {
            this.renderer.updatePointCloud(points, colors);
        }
    }

    showIntersection(result) {
        if (!result || !result.intersection || result.intersection.points.length === 0) return;
        
        const points = result.intersection.points;
        const colors = result.intersection.colors;
        
        if (points.length > 0) {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(points.length * 3);
            const colorArray = new Float32Array(points.length * 3);
            
            for (let i = 0; i < points.length; i++) {
                positions[i * 3] = points[i][0];
                positions[i * 3 + 1] = points[i][1];
                positions[i * 3 + 2] = points[i][2];
                
                colorArray[i * 3] = 1.0;
                colorArray[i * 3 + 1] = 1.0;
                colorArray[i * 3 + 2] = 0.0;
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
            
            const material = new THREE.PointsMaterial({
                size: 0.8,
                vertexColors: true,
                sizeAttenuation: true
            });
            
            this.intersectionPoints = new THREE.Points(geometry, material);
            this.renderer.scene.add(this.intersectionPoints);
        }
    }

    hideIntersection() {
        if (this.intersectionPoints) {
            this.renderer.scene.remove(this.intersectionPoints);
            this.intersectionPoints.geometry.dispose();
            this.intersectionPoints.material.dispose();
            this.intersectionPoints = null;
        }
    }

    async generateCrossSection(sessionId, planePoint, planeNormal, gridSize = 100) {
        try {
            const response = await fetch('/api/cross-section', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    plane_point: planePoint,
                    plane_normal: planeNormal,
                    grid_size: gridSize
                })
            });

            const result = await response.json();
            
            if (result.success) {
                return result.section;
            } else {
                throw new Error(result.error || 'Cross-section generation failed');
            }
        } catch (error) {
            console.error('Cross-section error:', error);
            throw error;
        }
    }

    renderCrossSection(section, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !section) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 300;
        
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
        
        const bounds = section.bounds;
        const gridU = section.grid_u;
        const gridV = section.grid_v;
        const gridZ = section.grid_z;
        
        const padding = 40;
        const dataWidth = width - padding * 2;
        const dataHeight = height - padding * 2;
        
        const uRange = bounds.u_max - bounds.u_min;
        const vRange = bounds.v_max - bounds.v_min;
        const zMin = Math.min(...gridZ.flat().filter(z => isFinite(z)));
        const zMax = Math.max(...gridZ.flat().filter(z => isFinite(z)));
        const zRange = zMax - zMin;
        
        const pointSize = 3;
        const rows = gridU.length;
        const cols = gridU[0].length;
        
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const u = gridU[i][j];
                const v = gridV[i][j];
                const z = gridZ[i][j];
                
                if (!isFinite(z)) continue;
                
                const x = padding + ((u - bounds.u_min) / uRange) * dataWidth;
                const y = padding + ((v - bounds.v_min) / vRange) * dataHeight;
                
                const normalizedZ = (z - zMin) / zRange;
                const color = this._heightToColor(normalizedZ);
                
                ctx.fillStyle = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
                ctx.beginPath();
                ctx.arc(x, y, pointSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.strokeStyle = '#0f3460';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        ctx.fillStyle = '#aaa';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('U 轴', width / 2, height - 10);
        
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('V 轴', 0, 0);
        ctx.restore();
    }

    _heightToColor(normalized) {
        if (normalized < 0.33) {
            const t = normalized / 0.33;
            return [0, 0.5 + 0.5 * t, 1 - 0.5 * t];
        } else if (normalized < 0.66) {
            const t = (normalized - 0.33) / 0.33;
            return [0, 1 - 0.5 * t, 0.5 * t];
        } else {
            const t = (normalized - 0.66) / 0.34;
            return [t, 1 - t, 0];
        }
    }

    reset() {
        this.isCutting = false;
        this.cutResult = null;
        this.hideIntersection();
        this.renderer.resetToOriginal();
    }

    setMeasureMode(mode) {
        this.measureMode = mode;
        this.measurePoints = [];
        this._bindMeasureEvents();
        this._redraw();
    }

    _bindMeasureEvents() {
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this._onCanvasMouseDown);
            this.canvas.removeEventListener('mousemove', this._onCanvasMouseMove);
            this.canvas.removeEventListener('mouseup', this._onCanvasMouseUp);
        }

        this.canvas = document.getElementById('cross-section-canvas');
        if (!this.canvas) return;

        this._onCanvasMouseDown = (e) => this._handleMouseDown(e);
        this._onCanvasMouseMove = (e) => this._handleMouseMove(e);
        this._onCanvasMouseUp = (e) => this._handleMouseUp(e);

        this.canvas.addEventListener('mousedown', this._onCanvasMouseDown);
        this.canvas.addEventListener('mousemove', this._onCanvasMouseMove);
        this.canvas.addEventListener('mouseup', this._onCanvasMouseUp);
    }

    _getCanvasPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    _canvasToData(canvasX, canvasY) {
        if (!this.currentSection) return null;

        const bounds = this.currentSection.bounds;
        const padding = 40;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const dataWidth = width - padding * 2;
        const dataHeight = height - padding * 2;

        const u = bounds.u_min + ((canvasX - padding) / dataWidth) * (bounds.u_max - bounds.u_min);
        const v = bounds.v_min + ((canvasY - padding) / dataHeight) * (bounds.v_max - bounds.v_min);

        return { u, v, x: canvasX, y: canvasY };
    }

    _handleMouseDown(event) {
        if (this.measureMode === 'none') return;

        this.isDrawing = true;
        const point = this._getCanvasPoint(event);
        const dataPoint = this._canvasToData(point.x, point.y);

        if (dataPoint) {
            this.measurePoints.push(dataPoint);

            if (this.measureMode === 'distance' && this.measurePoints.length >= 2) {
                this._addDistanceMeasurement();
                this.measurePoints = [];
                this.isDrawing = false;
            } else if (this.measureMode === 'angle' && this.measurePoints.length >= 3) {
                this._addAngleMeasurement();
                this.measurePoints = [];
                this.isDrawing = false;
            }

            this._redraw();
        }
    }

    _handleMouseMove(event) {
        if (!this.isDrawing || this.measureMode === 'none') return;

        const point = this._getCanvasPoint(event);
        this._redraw(point);
    }

    _handleMouseUp(event) {
        this.isDrawing = false;
    }

    _addDistanceMeasurement() {
        if (this.measurePoints.length < 2) return;

        const p1 = this.measurePoints[0];
        const p2 = this.measurePoints[1];

        const dx = p2.u - p1.u;
        const dv = p2.v - p1.v;
        const distance = Math.sqrt(dx * dx + dv * dv);

        this.measurements.push({
            type: 'distance',
            points: [{ ...p1 }, { ...p2 }],
            value: distance,
            color: '#00ff00'
        });

        this._updateMeasureDisplay('距离', distance.toFixed(2) + ' 单位');
    }

    _addAngleMeasurement() {
        if (this.measurePoints.length < 3) return;

        const p1 = this.measurePoints[0];
        const p2 = this.measurePoints[1];
        const p3 = this.measurePoints[2];

        const v1 = { x: p1.u - p2.u, y: p1.v - p2.v };
        const v2 = { x: p3.u - p2.u, y: p3.v - p2.v };

        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        let angle = 0;
        if (mag1 > 0 && mag2 > 0) {
            angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
            angle = angle * 180 / Math.PI;
        }

        this.measurements.push({
            type: 'angle',
            points: [{ ...p1 }, { ...p2 }, { ...p3 }],
            value: angle,
            color: '#ff6600'
        });

        this._updateMeasureDisplay('角度', angle.toFixed(2) + '°');
    }

    _updateMeasureDisplay(label, value) {
        const labelEl = document.getElementById('measure-label');
        const valueEl = document.getElementById('measure-value');
        const infoEl = document.getElementById('measurements-info');

        if (labelEl && valueEl) {
            labelEl.textContent = label + ':';
            valueEl.textContent = value;
            infoEl.style.display = 'block';
        }
    }

    clearMeasurements() {
        this.measurements = [];
        this.measurePoints = [];
        this._redraw();

        const infoEl = document.getElementById('measurements-info');
        if (infoEl) {
            infoEl.style.display = 'none';
        }
    }

    _redraw(previewPoint = null) {
        if (!this.canvas || !this.currentSection) return;

        this.renderCrossSection(this.currentSection, 'cross-section-canvas');
        this._drawMeasurements(previewPoint);
    }

    _drawMeasurements(previewPoint) {
        const ctx = this.canvas.getContext('2d');

        for (const meas of this.measurements) {
            if (meas.type === 'distance') {
                this._drawDistance(ctx, meas);
            } else if (meas.type === 'angle') {
                this._drawAngle(ctx, meas);
            }
        }

        if (this.isDrawing && this.measurePoints.length > 0) {
            this._drawPreview(ctx, previewPoint);
        }

        for (let i = 0; i < this.measurePoints.length; i++) {
            this._drawPoint(ctx, this.measurePoints[i]);
        }
    }

    _drawDistance(ctx, meas) {
        const p1 = meas.points[0];
        const p2 = meas.points[1];

        ctx.strokeStyle = meas.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(meas.value.toFixed(2), midX, midY - 8);
    }

    _drawAngle(ctx, meas) {
        const p1 = meas.points[0];
        const p2 = meas.points[1];
        const p3 = meas.points[2];

        ctx.strokeStyle = meas.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();

        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

        const angle1 = Math.atan2(v1.y, v1.x);
        const angle2 = Math.atan2(v2.y, v2.x);

        const radius = 25;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, radius, Math.min(angle1, angle2), Math.max(angle1, angle2));
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        const midAngle = (angle1 + angle2) / 2;
        const labelX = p2.x + Math.cos(midAngle) * (radius + 15);
        const labelY = p2.y + Math.sin(midAngle) * (radius + 15);
        ctx.fillText(meas.value.toFixed(1) + '°', labelX, labelY);
    }

    _drawPreview(ctx, previewPoint) {
        if (!previewPoint) return;

        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();

        for (let i = 0; i < this.measurePoints.length; i++) {
            const p = this.measurePoints[i];
            if (i === 0) {
                ctx.moveTo(p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }

        ctx.lineTo(previewPoint.x, previewPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawPoint(ctx, point) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}
