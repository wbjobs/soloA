class ContourManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.contours = [];
        this.heightGrid = null;
        this.isVisible = false;
    }

    async calculateContours(sessionId, gridResolution = 100, numLevels = 10, smooth = true, smoothSigma = 1.0) {
        try {
            const response = await fetch('/api/contours', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    grid_resolution: gridResolution,
                    num_levels: numLevels,
                    smooth: smooth,
                    smooth_sigma: smoothSigma
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.contours = result.contours;
                this.heightGrid = result.height_grid;
                this.stats = result.stats;
                return result;
            } else {
                throw new Error(result.error || 'Contour calculation failed');
            }
        } catch (error) {
            console.error('Contour error:', error);
            throw error;
        }
    }

    showContours() {
        if (!this.contours || this.contours.length === 0) return;
        
        const bounds = this.heightGrid.bounds;
        this.renderer.addContourLines(this.contours, bounds.z_min, bounds.z_max);
        this.isVisible = true;
    }

    hideContours() {
        this.renderer.removeContourLines();
        this.isVisible = false;
    }

    getStats() {
        if (!this.stats) return null;
        return {
            numContours: this.stats.num_contours,
            minLevel: this.stats.min_level,
            maxLevel: this.stats.max_level,
            levelRange: this.stats.level_range,
            bounds: this.stats.bounds
        };
    }

    getContourList() {
        if (!this.contours) return [];
        
        const uniqueLevels = {};
        for (const contour of this.contours) {
            const level = contour.level.toFixed(2);
            if (!uniqueLevels[level]) {
                uniqueLevels[level] = {
                    level: contour.level,
                    color: contour.color,
                    count: 0
                };
            }
            uniqueLevels[level].count++;
        }
        
        return Object.values(uniqueLevels).sort((a, b) => a.level - b.level);
    }

    clear() {
        this.hideContours();
        this.contours = [];
        this.heightGrid = null;
        this.stats = null;
        this.isVisible = false;
    }
}
