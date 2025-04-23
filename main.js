// 初始化场景、相机和渲染器
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87CEEB); // 天空蓝色背景
document.body.appendChild(renderer.domElement);

// 设置相机初始位置
camera.position.set(0, 1.74, 9.85); // y = 10*sin(10°), z = 10*cos(10°)
camera.lookAt(0, 0, 0);

// 添加轨道控制器
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.update();

// 创建纹理加载器
const textureLoader = new THREE.TextureLoader();

// 存储巴士对象的引用
let bus = null;
// 存储所有层的对象引用
const layerObjects = {};

// 图层信息及其z位置和移动速度
const layers = [
    { name: "img_bg6_sky", zPosition: -60, width: 1536/12, height: 586/12, speed: -0.002, y: 20 },       // 最远的天空背景
    { name: "img_bg5_mountain", zPosition: -55, width: 60, height: 10, speed: -0.01, y: -5 },  // 山脉
    { name: "img_bg3_fields", zPosition: -25, width: 20, height: 50, speed: -0.02, y: -6.3 },    // 田野，调整高度和位置
    { name: "img_bg1_road", zPosition: -1, width: 5, height: 2, speed: -0.03, y: -3 },        // 道路
    { name: "img_bus", zPosition: 0, width: 4, height: 2, isBus: true, speed: 0, y: -2 },     // 巴士
    { name: "img_fg_bush", zPosition: 1, width: 2, height: 1, speed: -0.03, y: -2.5 }            // 前景灌木
];

// 每个图层的实例管理器
class LayerInstanceManager {
    constructor(layer, material, geometry) {
        this.layer = layer;
        this.material = material;
        this.geometry = geometry;
        this.instances = [];
        this.speed = layer.speed;
        this.width = layer.width;
        this.instanceCount = 0;
        
        // 确定需要的实例数量（至少3个，或者足够覆盖屏幕宽度的数量）
        const requiredCount = Math.max(3, Math.ceil((window.innerWidth * 1.5) / layer.width) + 1);
        
        // 创建初始实例
        this.createInitialInstances(requiredCount);
    }
    
    createInitialInstances(count) {
        // 从左侧开始创建实例，确保覆盖整个视口和两侧
        const startX = -this.width * 1.5; // 从左侧开始，预留额外空间
        
        for (let i = 0; i < count; i++) {
            const instance = new THREE.Mesh(this.geometry, this.material);
            instance.position.z = this.layer.zPosition;
            
            // 设置Y轴位置
            if (this.layer.y !== undefined) {
                instance.position.y = this.layer.y;
            }
            
            // 设置X轴位置
            instance.position.x = startX + i * this.width;
            
            // 如果是田野图层，沿X轴旋转90度
            if (this.layer.name === "img_bg3_fields") {
                instance.rotation.x = Math.PI / 2 - Math.PI * 0.03;
            }
            
            // 添加到场景
            scene.add(instance);
            
            this.instances.push({
                mesh: instance,
                index: i
            });
            
            this.instanceCount++;
        }
    }
    
    update() {
        // 更新所有实例的位置
        for (let i = 0; i < this.instances.length; i++) {
            const instance = this.instances[i];
            instance.mesh.position.x -= this.speed;
            
            // 由于速度为负，现在检查实例是否完全离开了视口（右侧）
            if (this.speed < 0 && instance.mesh.position.x > this.width * 3) {
                // 找到最左侧的实例
                let leftmostInstance = this.instances[0];
                for (let j = 1; j < this.instances.length; j++) {
                    if (this.instances[j].mesh.position.x < leftmostInstance.mesh.position.x) {
                        leftmostInstance = this.instances[j];
                    }
                }
                
                // 将当前实例移动到最左侧实例的左侧
                instance.mesh.position.x = leftmostInstance.mesh.position.x - this.width;
            }
            // 保留原有的从右向左的移动逻辑
            else if (this.speed > 0 && instance.mesh.position.x < -this.width * 1.5) {
                // 找到最右侧的实例
                let rightmostInstance = this.instances[0];
                for (let j = 1; j < this.instances.length; j++) {
                    if (this.instances[j].mesh.position.x > rightmostInstance.mesh.position.x) {
                        rightmostInstance = this.instances[j];
                    }
                }
                
                // 将当前实例移动到最右侧实例的右侧
                instance.mesh.position.x = rightmostInstance.mesh.position.x + this.width;
            }
        }
    }
    
    setSpeed(newSpeed) {
        this.speed = newSpeed;
    }
}

// 存储图层管理器
const layerManagers = {};

// 创建并添加每个图层
layers.forEach(layer => {
    // 跳过巴士图层
    if (layer.isBus) {
        textureLoader.load(`img/${layer.name}.png`, (texture) => {
            // 设置纹理透明度
            texture.transparent = true;
            
            // 创建材质
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide
            });
            
            // 创建平面几何体
            const geometry = new THREE.PlaneGeometry(layer.width, layer.height);
            
            // 创建网格
            bus = new THREE.Mesh(geometry, material);
            bus.position.z = layer.zPosition;
            
            // 设置Y轴位置
            if (layer.y !== undefined) {
                bus.position.y = layer.y;
            }
            
            // 巴士保持在中心位置
            bus.position.x = 0;
            
            // 添加到场景
            scene.add(bus);
        });
        return;
    }
    
    textureLoader.load(`img/${layer.name}.png`, (texture) => {
        // 设置纹理透明度
        texture.transparent = true;
        
        // 创建材质
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // 创建平面几何体
        const geometry = new THREE.PlaneGeometry(layer.width, layer.height);
        
        // 创建并存储层实例管理器
        layerManagers[layer.name] = new LayerInstanceManager(layer, material, geometry);
    });
});

// 添加环境光
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

// 处理窗口大小变化
window.addEventListener('resize', () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;
    
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    
    renderer.setSize(newWidth, newHeight);
});

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    
    // 更新每个图层的实例
    for (const layerName in layerManagers) {
        layerManagers[layerName].update();
    }
    
    // 更新控制器
    controls.update();
    
    // 渲染场景
    renderer.render(scene, camera);
}

// 启动动画循环
animate(); 