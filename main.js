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

// 相机摆动相关变量
const cameraSwing = {
    angle: 0,
    speed: 0.005,
    amplitude: 3 * (Math.PI / 180), // 转换为弧度
    baseY: 1.74,
    baseZ: 9.85
};

// 巴士动画相关变量
const busAnimation = {
    // Y轴偏移相关
    yOffset: 0,
    yOffsetSpeed: 0.4,  // 上下偏移的速度
    yOffsetMax: 0.3,    // 最大偏移量为±0.3
    // 马达震动相关
    vibrationAngle: 0,
    vibrationSpeed: 0,  // 震动频率
    vibrationAmplitude: 0.01,  // 震动幅度
    // 旋转震动相关
    rotationVibrationAngle: 0,
    rotationVibrationSpeed: 30,  // 旋转震动频率
    rotationVibrationAmplitude: 0.005  // 旋转震动幅度（弧度）
};

// 创建纹理加载器
const textureLoader = new THREE.TextureLoader();

// 存储巴士对象的引用
let bus = null;
// 存储所有层的对象引用
const layerObjects = {};
// 存储电线杆对象数组 - 改为数组存储多个电线杆
const poles = [];
// 存储电线对象数组 - 改为数组存储多个电线
const wires = [];
// 电线杆刷新计时器
let poleTimer = 0;
// 电线杆刷新间隔（秒）- 增加间隔，使电线杆间距增大
const poleRefreshInterval = 5; // 从2秒增加到4秒，使间距增加2倍
// 初始化标志，表示是否为第一次创建
let isFirstPoleCreated = false;
// 屏幕边界 (比实际视口更宽，确保在完全不可见的位置创建和移除)
const SCREEN_BOUNDARY = {
    left: -15, // 扩大边界确保不穿帮
    right: 20  // 大幅增加右侧边界，使电线杆在完全离开视野后再移除
};
// 最多同时存在的电线杆数量
const MAX_POLES = 6; // 增加最大电线杆数量，确保有足够的电线杆覆盖场景
// 全局引用以解决作用域问题
let createWireBetweenPolesFunc = null;

// 小屋相关变量
const houses = [];
let houseTimer = 0;
const houseRefreshIntervalMin = 30; // 最小刷新间隔（秒）
const houseRefreshIntervalMax = 30; // 最大刷新间隔（秒）
let currentHouseInterval = 30; // 当前刷新间隔
const MAX_HOUSES = 5; // 最多同时存在的小屋数量

// 图层信息及其z位置和移动速度
const layers = [
    { name: "img_bg6_sky", zPosition: -60, width: 1536/12, height: 586/12, speed: -0.002, y: 20 },       // 最远的天空背景
    { name: "img_bg5_mountain", zPosition: -50, width: 60, height: 10, speed: -0.01, y: -5 },  // 山脉
    { name: "img_bg4_house", zPosition: -15, width: 4, height: 2.5, speed: 0.01, y: -2.5, isHouse: true }, // 小屋层，位置在山脉和田野之间
    { name: "img_bg3_fields", zPosition: -25, width: 20, height: 50, speed: -0.02, y: -6.3 },    // 田野，调整高度和位置
    { name: "img_bg1_road", zPosition: -1, width: 5, height: 2, speed: -0.03, y: -3 },        // 道路
    { name: "img_bg2_pole", zPosition: -0.5, width: 1, height: 5, speed: 0.03, y: 0.5, isPole: true },  // 电线杆，在道路和巴士之间，正向速度表示从左到右
    { name: "img_bus", zPosition: 1, width: 4, height: 2, isBus: true, speed: 0, y: -1.5 },     // 巴士
    { name: "img_fg_bush", zPosition: 2, width: 2, height: 1, speed: -0.03, y: -2 }            // 前景灌木
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
    
    // 小屋层的特殊处理
    if (layer.isHouse) {
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
            
            // 创建小屋函数
            function createHouse() {
                // 创建新小屋
                const house = new THREE.Mesh(geometry, material);
                house.position.z = layer.zPosition;
                
                // 随机Y轴位置变化，给予小屋一些高度变化
                const yVariation = Math.random() * 0.5 - 0.25; // -0.25到0.25的随机值
                house.position.y = layer.y + yVariation;
                
                // 随机小屋位置在屏幕外左侧
                house.position.x = SCREEN_BOUNDARY.left - 5 - Math.random() * 5;
                
                // 添加到场景
                scene.add(house);
                
                // 添加到小屋数组
                houses.push(house);
                
                // 设置移动速度（使用图层定义的速度的绝对值，使其向右移动）
                const speedVariation = Math.random() * 0.005; // 0到0.005的随机值
                house.userData = {
                    speed: Math.abs(layer.speed) + speedVariation, // 使用图层定义速度的绝对值，确保向右移动
                    isBeingRemoved: false
                };
                
                // 如果小屋数量超过最大值，移除最老的小屋
                if (houses.length > MAX_HOUSES) {
                    const oldestHouse = houses.shift();
                    scene.remove(oldestHouse);
                }
                
                // 设置下一次刷新间隔为3-5秒的随机值
                currentHouseInterval = houseRefreshIntervalMin + Math.random() * (houseRefreshIntervalMax - houseRefreshIntervalMin);
                houseTimer = 0;
            }
            
            // 初始创建一个小屋
            createHouse();
            
            // 将创建小屋函数保存到全局作用域
            window.createHouse = createHouse;
        });
        return;
    }
    
    // 电线杆的特殊处理
    if (layer.isPole) {
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
            
            // 创建电线杆函数
            function createPole() {
                // 创建新电线杆
                const pole = new THREE.Mesh(geometry, material);
                pole.position.z = layer.zPosition;
                pole.position.y = layer.y;
                
                // 设置初始位置在屏幕左侧边界
                pole.position.x = SCREEN_BOUNDARY.left;
                
                // 添加到场景
                scene.add(pole);
                
                // 添加到电线杆数组
                poles.push(pole);
                
                // 根据电线杆数量给每个电线杆一个索引，用于调试和追踪
                pole.userData = {
                    index: poles.length - 1,
                    isBeingRemoved: false // 标记是否正在被移除
                };
                
                // 如果电线杆数量超过最大值，移除最老的电线杆和相关电线
                if (poles.length > MAX_POLES) {
                    const oldestPole = poles.shift(); // 移除并获取最老的电线杆
                    scene.remove(oldestPole);
                    
                    // 移除最老的电线
                    if (wires.length > 0) {
                        const oldestWire = wires.shift();
                        scene.remove(oldestWire);
                    }
                }
            }
            
            // 创建两个电线杆之间的弧形电线
            function createWireBetweenPoles(pole1, pole2) {
                // 如果任一电线杆不存在，则不创建电线
                if (!pole1 || !pole2) return null;
                
                // 创建曲线几何体
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, 0, 0), // 占位点，会在updateWire中更新
                    new THREE.Vector3(0, 0, 0)  // 占位点，会在updateWire中更新
                ]);
                
                const wireGeometry = new THREE.BufferGeometry().setFromPoints(
                    curve.getPoints(50) // 获取50个点来平滑曲线
                );
                
                // 创建电线材质 - 黑色细线
                const wireMaterial = new THREE.LineBasicMaterial({ 
                    color: 0x000000,
                    linewidth: 2 // 加粗电线，使其更容易看到
                });
                
                // 创建电线对象
                const wire = new THREE.Line(wireGeometry, wireMaterial);
                
                // 存储关联的电线杆
                wire.userData = {
                    pole1: pole1,
                    pole2: pole2,
                    curve: curve,
                    pole1Index: pole1.userData.index,
                    pole2Index: pole2.userData.index
                };
                
                // 初次更新电线位置
                updateWire(wire);
                
                // 添加到场景
                scene.add(wire);
                
                return wire;
            }
            
            // 将函数保存到全局作用域变量
            createWireBetweenPolesFunc = createWireBetweenPoles;
            
            // 更新单个电线
            function updateWire(wire) {
                if (!wire.userData || !wire.userData.pole1 || !wire.userData.pole2) return;
                
                const pole1 = wire.userData.pole1;
                const pole2 = wire.userData.pole2;
                const curve = wire.userData.curve;
                
                // 计算电线杆顶部的位置
                const poleHeight = layer.height / 2; // 电线杆的一半高度（中心点到顶部）
                
                // 第一个电线杆顶部位置
                const pole1TopPosition = new THREE.Vector3(
                    pole1.position.x,
                    pole1.position.y + poleHeight - 0.2, // 稍微偏下一点，不是正好在顶部
                    pole1.position.z
                );
                
                // 第二个电线杆顶部位置
                const pole2TopPosition = new THREE.Vector3(
                    pole2.position.x,
                    pole2.position.y + poleHeight - 0.2,
                    pole2.position.z
                );
                
                // 计算两电线杆间的距离
                const distance = pole2TopPosition.distanceTo(pole1TopPosition);
                
                // 创建弧线的点
                const curvePoints = [];
                const segments = 20; // 线段数量
                
                // 创建一条弧形线
                for (let i = 0; i <= segments; i++) {
                    const t = i / segments;
                    
                    // 计算x坐标 - 线性插值
                    const x = pole1TopPosition.x * (1 - t) + pole2TopPosition.x * t;
                    
                    // 计算y坐标 - 下垂的弧线
                    // 下垂量：距离越大，下垂越多
                    const sagAmount = Math.min(0.3 + distance * 0.05, 1.0);
                    // 在t=0.5处达到最低点，使用二次函数模拟下垂
                    const y = pole1TopPosition.y - sagAmount * 4 * t * (1 - t);
                    
                    // z坐标保持不变
                    const z = pole1TopPosition.z;
                    
                    curvePoints.push(new THREE.Vector3(x, y, z));
                }
                
                // 更新曲线
                curve.points = curvePoints;
                
                // 更新几何体
                wire.geometry.dispose();
                wire.geometry = new THREE.BufferGeometry().setFromPoints(
                    curve.getPoints(50)
                );
            }
            
            // 更新所有电线
            function updateAllWires() {
                // 清除所有现有电线
                wires.forEach(wire => {
                    scene.remove(wire);
                });
                wires.length = 0;
                
                // 为每对相邻的电线杆创建新电线
                for (let i = 0; i < poles.length - 1; i++) {
                    // 确保两个电线杆都存在且未被标记为正在移除
                    if (poles[i] && poles[i+1] && !poles[i].userData.isBeingRemoved && !poles[i+1].userData.isBeingRemoved) {
                        const wire = createWireBetweenPoles(poles[i], poles[i + 1]);
                        if (wire) {
                            wires.push(wire);
                        }
                    }
                }
            }
            
            // 保存函数便于后续使用
            layerObjects[layer.name] = {
                createPole: createPole,
                updateAllWires: updateAllWires,
                updateWire: updateWire,
                speed: layer.speed
            };
            
            // 创建初始电线杆，立即创建第一个电线杆，不等待计时器
            createPole();
            isFirstPoleCreated = true;
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

// 更新相机位置的函数
function updateCamera() {
    // 计算相机角度
    cameraSwing.angle += cameraSwing.speed;
    
    // 计算相机摆动角度
    const swingAmount = Math.sin(cameraSwing.angle) * cameraSwing.amplitude;
    
    // 更新相机位置
    const distance = 10; // 相机到原点的固定距离
    const baseAngle = 10 * (Math.PI / 180); // 10度的基础角度（弧度）
    const currentAngle = baseAngle + swingAmount;
    
    camera.position.y = distance * Math.sin(currentAngle);
    camera.position.z = distance * Math.cos(currentAngle);
    
    // 始终看向原点
    camera.lookAt(0, 0, 0);
}

// 更新电线杆位置和刷新
function updatePole(deltaTime) {
    // 如果电线杆数组为空或没有加载电线杆管理器，则返回
    if (poles.length === 0 || !layerObjects["img_bg2_pole"]) {
        return;
    }
    
    // 更新所有电线杆位置
    let needCreateNewWires = false;
    
    for (let i = poles.length - 1; i >= 0; i--) {
        const pole = poles[i];
        pole.position.x += layerObjects["img_bg2_pole"].speed;
        
        // 如果电线杆移出屏幕很远，标记为需要删除
        if (pole.position.x > SCREEN_BOUNDARY.right) {
            // 标记电线杆为正在移除状态
            pole.userData.isBeingRemoved = true;
            
            // 移除电线杆
            scene.remove(pole);
            poles.splice(i, 1);
            
            // 找到与此电线杆相关的所有电线并移除
            for (let j = wires.length - 1; j >= 0; j--) {
                const wire = wires[j];
                if (wire.userData.pole1 === pole || wire.userData.pole2 === pole) {
                    scene.remove(wire);
                    wires.splice(j, 1);
                }
            }
            
            needCreateNewWires = true;
        }
    }
    
    // 如果需要，重新创建所有电线
    if (needCreateNewWires && poles.length >= 2) {
        layerObjects["img_bg2_pole"].updateAllWires();
    } else {
        // 否则，更新每根电线的位置
        wires.forEach(wire => {
            layerObjects["img_bg2_pole"].updateWire(wire);
        });
    }
    
    // 更新计时器
    poleTimer += deltaTime;
    
    // 当计时器超过刷新间隔时，创建新电线杆（跳过第一个，因为已经在初始化时创建了）
    if (poleTimer >= poleRefreshInterval) {
        layerObjects["img_bg2_pole"].createPole();
        
        // 如果有多个电线杆，确保创建电线
        if (poles.length >= 2 && createWireBetweenPolesFunc) {
            // 查找是否需要为最新的两个电线杆创建电线
            const lastPoleIndex = poles.length - 1;
            const secondLastPoleIndex = lastPoleIndex - 1;
            
            // 确保两个电线杆都存在且未被标记为正在移除
            if (poles[secondLastPoleIndex] && !poles[secondLastPoleIndex].userData.isBeingRemoved) {
                // 创建新电线
                const newWire = createWireBetweenPolesFunc(poles[secondLastPoleIndex], poles[lastPoleIndex]);
                
                // 加入到电线数组
                if (newWire) {
                    wires.push(newWire);
                }
            }
        }
        
        poleTimer = 0; // 重置计时器
    }
    
    // 如果只有一个电线杆且它已经移动了一定距离，创建第二个电线杆
    if (poles.length === 1 && !isFirstPoleCreated && poles[0].position.x > SCREEN_BOUNDARY.left + 5) {
        layerObjects["img_bg2_pole"].createPole();
        
        // 创建两个电线杆之间的电线
        if (createWireBetweenPolesFunc) {
            const newWire = createWireBetweenPolesFunc(poles[0], poles[1]);
            if (newWire) {
                wires.push(newWire);
            }
        }
        
        isFirstPoleCreated = true;
    }
}

// 上一帧的时间戳
let lastTime = 0;

// 动画循环
function animate(timestamp) {
    requestAnimationFrame(animate);
    
    // 计算帧间隔时间（秒）
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    // 更新每个图层的实例
    for (const layerName in layerManagers) {
        layerManagers[layerName].update();
    }
    
    // 更新电线杆
    updatePole(deltaTime);

    // 更新小屋
    if (houses.length > 0) {
        // 更新所有小屋位置
        for (let i = houses.length - 1; i >= 0; i--) {
            const house = houses[i];
            house.position.x += house.userData.speed;
            
            // 如果小屋移出屏幕右侧很远，移除它
            if (house.position.x > SCREEN_BOUNDARY.right + 10) {
                scene.remove(house);
                houses.splice(i, 1);
            }
        }
        
        // 更新小屋计时器
        houseTimer += deltaTime;
        
        // 当计时器超过当前刷新间隔时，创建新小屋
        if (houseTimer >= currentHouseInterval && window.createHouse) {
            window.createHouse();
        }
    }
    
    // 更新巴士动画（如果巴士已加载）
    if (bus) {
        // 更新Y轴偏移
        busAnimation.yOffset += busAnimation.yOffsetSpeed * deltaTime;
        // 使用正弦函数创建平滑的上下运动
        const yOffset = Math.sin(busAnimation.yOffset) * busAnimation.yOffsetMax;
        
        // 计算马达震动效果
        busAnimation.vibrationAngle += busAnimation.vibrationSpeed * deltaTime;
        const xVibration = Math.sin(busAnimation.vibrationAngle) * busAnimation.vibrationAmplitude;
        const yVibration = Math.cos(busAnimation.vibrationAngle * 1.3) * busAnimation.vibrationAmplitude; // 使用不同频率增加随机感
        
        // 计算旋转震动效果
        busAnimation.rotationVibrationAngle += busAnimation.rotationVibrationSpeed * deltaTime;
        const zRotation = Math.sin(busAnimation.rotationVibrationAngle) * busAnimation.rotationVibrationAmplitude;
        
        // 获取巴士原始Y位置（从layers数组中）
        const busLayer = layers.find(layer => layer.isBus);
        const baseY = busLayer ? busLayer.y : -1.5;
        
        // 将平滑偏移和震动效果应用到巴士位置
        bus.position.y = baseY + yOffset + yVibration;
        bus.position.x = xVibration; // 应用水平震动
        bus.rotation.z = zRotation; // 应用旋转震动
    }
    
    // 更新相机摆动
    updateCamera();
    
    // 渲染场景
    renderer.render(scene, camera);
}

// 启动动画循环
animate(0); 