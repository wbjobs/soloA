class ThreeRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.pointCloud = null;
        this.contourLines = [];
        this.cutPlane = null;
        this.boundingBox = null;
        this.originalPoints = null;
        this.simplifiedPoints = null;
        this.center = null;
        this.rotationEnabled = false;
        this.panEnabled = false;
        this.zoomEnabled = false;
        this._cutPlaneHelper = null;
        this._init();
    }

    _init() {
        this._createScene();
        this._createCamera();
        this._createRenderer();
        this._createLights();
        this._createAxesHelper();
        this._createGridHelper();
        this._addWindowResizeListener();
        this._animate();
    }

    _createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
    }

    _createCamera() {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
        this.camera.position.set(50, 50, 50);
        this.camera.lookAt(0, 0, 0);
    }

    _createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    _createLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-1, -1, -1);
        this.scene.add(directionalLight2);
    }

    _createAxesHelper() {
        this.axesHelper = new THREE.AxesHelper(20);
        this.scene.add(this.axesHelper);
    }

    _createGridHelper() {
        this.gridHelper = new THREE.GridHelper(100, 20, 0x0f3460, 0x0f3460);
        this.scene.add(this.gridHelper);
    }

    _addWindowResizeListener() {
        window.addEventListener('resize', () => this._onWindowResize());
    }

    _onWindowResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        this.renderer.render(this.scene, this.camera);
    }

    loadPointCloud(points, colors) {
        this._clearPointCloud();
        
        const count = points.length;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colorArray = new Float32Array(count * 3);
        
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        const batchSize = 10000;
        for (let i = 0; i < count; i += batchSize) {
            const end = Math.min(i + batchSize, count);
            for (let j = i; j < end; j++) {
                const idx = j * 3;
                positions[idx] = points[j][0];
                positions[idx + 1] = points[j][1];
                positions[idx + 2] = points[j][2];
                
                colorArray[idx] = colors[j][0];
                colorArray[idx + 1] = colors[j][1];
                colorArray[idx + 2] = colors[j][2];
                
                if (points[j][0] < minX) minX = points[j][0];
                if (points[j][1] < minY) minY = points[j][1];
                if (points[j][2] < minZ) minZ = points[j][2];
                if (points[j][0] > maxX) maxX = points[j][0];
                if (points[j][1] > maxY) maxY = points[j][1];
                if (points[j][2] > maxZ) maxZ = points[j][2];
            }
        }
        
        const positionAttribute = new THREE.BufferAttribute(positions, 3);
        positionAttribute.setUsage(THREE.StaticDrawUsage);
        geometry.setAttribute('position', positionAttribute);
        
        const colorAttribute = new THREE.BufferAttribute(colorArray, 3);
        colorAttribute.setUsage(THREE.StaticDrawUsage);
        geometry.setAttribute('color', colorAttribute);
        
        const min = [minX, minY, minZ];
        const max = [maxX, maxY, maxZ];
        
        this.center = [
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        ];
        
        const diagonal = Math.sqrt(
            Math.pow(maxX - minX, 2) +
            Math.pow(maxY - minY, 2) +
            Math.pow(maxZ - minZ, 2)
        );
        const pointSize = Math.max(0.1, diagonal / 1000);
        
        const material = new THREE.PointsMaterial({
            size: pointSize,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: false,
            depthWrite: true
        });
        
        this.pointCloud = new THREE.Points(geometry, material);
        this.pointCloud.frustumCulled = true;
        this.scene.add(this.pointCloud);
        
        this._updateBoundingBox(min, max);
        this._updateGrid(min, max);
        this._adjustCamera(min, max);
        
        this.originalPoints = { points, colors };
    }

    _clearPointCloud() {
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
            this.pointCloud = null;
        }
    }

    _updateBoundingBox(min, max) {
        if (this.boundingBox) {
            this.scene.remove(this.boundingBox);
            this.boundingBox.geometry.dispose();
            this.boundingBox.material.dispose();
        }
        
        const boxGeometry = new THREE.BoxGeometry(
            max[0] - min[0],
            max[2] - min[2],
            max[1] - min[1]
        );
        
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00d4ff, linewidth: 2 });
        this.boundingBox = new THREE.LineSegments(edges, lineMaterial);
        this.boundingBox.position.set(
            this.center[0],
            this.center[2],
            this.center[1]
        );
        this.scene.add(this.boundingBox);
    }

    _updateGrid(min, max) {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }
        
        const size = Math.max(max[0] - min[0], max[1] - min[1]);
        const divisions = Math.floor(size / 5);
        this.gridHelper = new THREE.GridHelper(size, divisions, 0x0f3460, 0x0f3460);
        this.gridHelper.position.y = min[2];
        this.scene.add(this.gridHelper);
    }

    _adjustCamera(min, max) {
        const size = Math.max(
            max[0] - min[0],
            max[1] - min[1],
            max[2] - min[2]
        );
        
        const distance = size * 2;
        const centerX = this.center[0];
        const centerY = this.center[2];
        const centerZ = this.center[1];
        
        this.camera.position.set(
            centerX + distance,
            centerY + distance,
            centerZ + distance
        );
        
        this.camera.lookAt(centerX, centerY, centerZ);
    }

    updatePointCloud(points, colors) {
        if (!this.pointCloud) {
            this.loadPointCloud(points, colors);
            return;
        }
        
        const count = points.length;
        const positions = new Float32Array(count * 3);
        const colorArray = new Float32Array(count * 3);
        
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            positions[idx] = points[i][0];
            positions[idx + 1] = points[i][1];
            positions[idx + 2] = points[i][2];
            
            colorArray[idx] = colors[i][0];
            colorArray[idx + 1] = colors[i][1];
            colorArray[idx + 2] = colors[i][2];
        }
        
        this.pointCloud.geometry.dispose();
        const newGeometry = new THREE.BufferGeometry();
        
        const positionAttribute = new THREE.BufferAttribute(positions, 3);
        positionAttribute.setUsage(THREE.StaticDrawUsage);
        newGeometry.setAttribute('position', positionAttribute);
        
        const colorAttribute = new THREE.BufferAttribute(colorArray, 3);
        colorAttribute.setUsage(THREE.StaticDrawUsage);
        newGeometry.setAttribute('color', colorAttribute);
        
        this.pointCloud.geometry = newGeometry;
        this.simplifiedPoints = { points, colors };
    }

    addContourLines(contours, minZ, maxZ) {
        this.removeContourLines();
        
        for (const contour of contours) {
            const points = [];
            for (const vertex of contour.vertices) {
                points.push(new THREE.Vector3(
                    vertex[0],
                    contour.level,
                    vertex[1]
                ));
            }
            
            if (points.length < 2) continue;
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const color = new THREE.Color(
                contour.color[0],
                contour.color[1],
                contour.color[2]
            );
            const material = new THREE.LineBasicMaterial({
                color: color,
                linewidth: 2
            });
            
            const line = new THREE.Line(geometry, material);
            this.contourLines.push(line);
            this.scene.add(line);
        }
    }

    removeContourLines() {
        for (const line of this.contourLines) {
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        }
        this.contourLines = [];
    }

    addCutPlane(planePoint, planeNormal) {
        const normal = new THREE.Vector3(planeNormal[0], planeNormal[2], planeNormal[1]).normalize();
        const point = new THREE.Vector3(planePoint[0], planePoint[2], planePoint[1]);
        
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(normal, point);
        
        if (this._cutPlaneHelper) {
            this._cutPlaneHelper.plane.copy(plane);
            this._cutPlaneHelper.visible = true;
        } else {
            const size = this._getSceneSize();
            this._cutPlaneHelper = new THREE.PlaneHelper(plane, size, 0xffff00);
            this.scene.add(this._cutPlaneHelper);
        }
        
        this.cutPlane = this._cutPlaneHelper;
    }

    removeCutPlane() {
        if (this._cutPlaneHelper) {
            this._cutPlaneHelper.visible = false;
        }
        this.cutPlane = null;
    }

    _getSceneSize() {
        if (this.boundingBox) {
            const box = new THREE.Box3().setFromObject(this.boundingBox);
            const size = new THREE.Vector3();
            box.getSize(size);
            return Math.max(size.x, size.y, size.z) * 2;
        }
        return 100;
    }

    resetToOriginal() {
        if (this.originalPoints) {
            this.updatePointCloud(this.originalPoints.points, this.originalPoints.colors);
        }
        this.removeContourLines();
        this.removeCutPlane();
    }

    takeScreenshot() {
        this.renderer.render(this.scene, this.camera);
        return this.canvas.toDataURL('image/png');
    }

    setPointSize(size) {
        if (this.pointCloud) {
            this.pointCloud.material.size = size;
        }
    }
}
