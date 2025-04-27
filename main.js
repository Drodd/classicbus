// 初始化场景、相机和渲染器
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xd3b491); // 浅褐色背景
document.body.appendChild(renderer.domElement);

// 乘客管理相关变量
const passengerSystem = {
    passengers: [],           // 存储所有乘客信息
    waitingCount: 0,          // 等待下车的乘客数量
    arrivedCount: 0,          // 已成功下车的乘客数量
    movingTime: 0,            // 巴士运动状态的累计时间（秒）
    pedestrianSpawnTimer: 0,  // 路人生成计时器，初始设为0
    pedestrianSpawnInterval: 10, // 路人生成间隔（秒）
    pedestrians: [],          // 存储所有路人对象
    pedestrianSpeed: 1,       // 路人移动速度
    pedestrianWaitingToBoard: false, // 是否有路人正在等待上车
    notificationShown: false, // 是否显示了乘客需要下车的提示
    notificationElement: null, // 下车提示元素引用
    passengerCountElement: null, // 乘客数量显示元素引用
    chatHistory: [],          // 存储已触发的对话历史
    usedConversations: new Set(), // 存储已触发的对话内容的索引，避免重复
    allCollectedMessageShown: false, // 是否已显示收集全部轶闻的恭喜弹窗
    chatSystem: {
        isChattingActive: false, // 是否有正在进行的对话
        chatProbability: 0.3,     // 每秒触发对话的概率（增加到0.3）
        chatTimer: 0,            // 对话计时器
        chatDuration: 3,         // 每句对话显示持续时间(秒)
        activeChatters: [],      // 当前正在对话的乘客
        chatBubbleElement: null, // 对话气泡元素引用
        currentDialogueIndex: 0, // 当前对话的句子索引
        currentDialogue: null,   // 当前正在进行的完整对话
        chattedSeats: new Set()  // 存储已经参与过对话的座位ID
    }
};

// 座位管理系统
const seatSystem = {
    seats: [
        // 第1排
        { id: "seat-1-1-1", type: "single", occupied: false, passenger: null },
        { id: "seat-1-1-2", type: "single", occupied: false, passenger: null },
        { id: "seat-1-2", type: "single", occupied: false, passenger: null },
        // 第2排
        { id: "seat-2-1-1", type: "single", occupied: false, passenger: null },
        { id: "seat-2-1-2", type: "single", occupied: false, passenger: null },
        { id: "seat-2-2", type: "single", occupied: false, passenger: null },
        // 第3排 (只有一个单人座)
        { id: "seat-3-2", type: "single", occupied: false, passenger: null },
        // 第4排
        { id: "seat-4-1-1", type: "single", occupied: false, passenger: null },
        { id: "seat-4-1-2", type: "single", occupied: false, passenger: null },
        { id: "seat-4-2", type: "single", occupied: false, passenger: null },
        // 第5排
        { id: "seat-5-1-1", type: "single", occupied: false, passenger: null },
        { id: "seat-5-1-2", type: "single", occupied: false, passenger: null },
        { id: "seat-5-2", type: "single", occupied: false, passenger: null }
    ],
    
    // 获取所有空座位
    getEmptySeats: function() {
        return this.seats.filter(seat => !seat.occupied);
    },
    
    // 随机选择一个空座位
    getRandomEmptySeat: function() {
        const emptySeats = this.getEmptySeats();
        if (emptySeats.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * emptySeats.length);
        return emptySeats[randomIndex];
    },
    
    // 占用座位
    occupySeat: function(seatId, passenger) {
        const seat = this.seats.find(s => s.id === seatId);
        if (seat) {
            seat.occupied = true;
            seat.passenger = passenger;
            this.updateSeatVisual(seat.id, true);
            
            // 当新乘客占用座位时，确保从已对话集合中移除该座位ID
            // 这样新乘客就可以参与对话了
            if (passengerSystem.chatSystem.chattedSeats.has(seatId)) {
                console.log(`新乘客占用座位 ${seatId}，从已对话集合中移除该座位`);
                passengerSystem.chatSystem.chattedSeats.delete(seatId);
                // 更新测试对话按钮文本
                updateTestChatButtonText();
            }
            
            return true;
        }
        return false;
    },
    
    // 释放座位
    freeSeat: function(seatId) {
        const seat = this.seats.find(s => s.id === seatId);
        if (seat && seat.occupied) {
            seat.occupied = false;
            seat.passenger = null;
            this.updateSeatVisual(seat.id, false);
            
            // 释放座位时也从对话集合中移除
            releaseSeatFromChat(seatId);
            
            return true;
        }
        return false;
    },
    
    // 更新座位的视觉效果
    updateSeatVisual: function(seatId, isOccupied) {
        console.log(`更新座位 ${seatId} 视觉效果, 占用: ${isOccupied}`);
        const seatElement = document.getElementById(seatId);
        if (seatElement) {
            if (isOccupied) {
                // 如果座位上没有乘客图标，添加一个
                if (!seatElement.querySelector('.passenger')) {
                    console.log(`座位 ${seatId} 添加乘客元素`);
                    const passengerElement = document.createElement('div');
                    passengerElement.className = 'passenger';
                    seatElement.appendChild(passengerElement);
                }
            } else {
                // 移除乘客图标
                const passengerElement = seatElement.querySelector('.passenger');
                if (passengerElement) {
                    console.log(`座位 ${seatId} 移除乘客元素`);
                    seatElement.removeChild(passengerElement);
                }
            }
        } else {
            console.error(`未找到座位元素 ${seatId}`);
        }
    },
    
    // 初始化所有座位的视觉效果
    initializeSeats: function() {
        this.seats.forEach(seat => {
            this.updateSeatVisual(seat.id, seat.occupied);
        });
    },
    
    initialized: false
};

// 从已参与对话的座位集合中移除指定座位ID
function releaseSeatFromChat(seatId) {
    if (passengerSystem.chatSystem.chattedSeats.has(seatId)) {
        console.log(`将座位 ${seatId} 从已对话集合中移除`);
        passengerSystem.chatSystem.chattedSeats.delete(seatId);
        // 更新测试对话按钮文本
        updateTestChatButtonText();
    }
}

// 设置相机初始位置
camera.position.set(0, 1.74, 9.85); // y = 10*sin(10°), z = 10*cos(10°)
camera.lookAt(0, 0, 0);

// 相机摆动相关变量
const cameraSwing = {
    angle: 0,
    speed: 0.005,
    amplitude: 0 * (Math.PI / 180), // 转换为弧度
    baseY: 1.74,
    baseZ: 9.85
};

// 巴士动画相关变量
const busAnimation = {
    // Y轴偏移相关
    yOffset: 0,
    yOffsetSpeed: 0.4,  // 上下偏移的速度
    yOffsetMax: 0.1,    // 最大偏移量为±0.1
    // 马达震动相关
    vibrationAngle: 0,
    vibrationSpeed: 1,  // 震动频率
    vibrationAmplitude: 0.005,  // 震动幅度
    // 旋转震动相关
    rotationVibrationAngle: 0,
    rotationVibrationSpeed: 0,  // 旋转震动频率
    rotationVibrationAmplitude: 0.002,  // 旋转震动幅度（弧度）
    // 巴士状态控制
    isMoving: true,  // 巴士是否处于运动状态，默认为运动状态
    // 速度控制
    acceleration: 4.0,  // 加速度系数
    deceleration: 5.0,  // 减速度系数
    maxVibrationSpeed: 30,  // 最大震动频率
    currentSpeedFactor: 1.0  // 当前速度因子 (0.0-1.0)
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
const poleRefreshInterval = 6; // 从2秒增加到4秒，使间距增加2倍
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
    { name: "img_bg6_sky", zPosition: -60, width: 1536/12, height: 586/12, speed: -0.002, y: 18, defaultSpeed: -0.002 },       // 最远的天空背景
    { name: "img_bg5_mountain", zPosition: -50, width: 60/1.5, height: 10/1.5, speed: -0.01, y: -6, defaultSpeed: -0.01 },  // 山脉
    { name: "img_bg4_house", zPosition: -15, width: 4, height: 2.5, speed: 0.01, y: -2.5, isHouse: true, defaultSpeed: 0.01 }, // 小屋层，位置在山脉和田野之间
    { name: "img_bg3_fields", zPosition: -34, width: 20*1.3, height: 50*1.3, speed: -0.02, y: -7.0, defaultSpeed: -0.02 },    // 田野，调整高度和位置
    { name: "img_bg1_road", zPosition: -1, width: 375*0.01, height: 135*0.01, speed: -0.03, y: -1.9, defaultSpeed: -0.03 },        // 道路
    { name: "img_man", zPosition: 2, width: 45*0.005, height: 146*0.005, speed: 0, y: -0.35, isPedestrian: true, defaultSpeed: 0 },  // 路人层，在道路和巴士之间
    { name: "img_bg2_pole", zPosition: 1, width: 103*0.01, height: 538*0.01, speed: 0.03, y: 1.8, isPole: true, defaultSpeed: 0.03 },  // 电线杆，在道路和巴士之间，正向速度表示从左到右
    { name: "img_bus", zPosition: 3, width: 629*0.0045, height: 356*0.0045, isBus: true, speed: 0, y: 0, defaultSpeed: 0 },     // 巴士
    { name: "img_fg_bush", zPosition: 4, width: 482*0.003, height: 236*0.003, speed: -0.03, y: -0.3, defaultSpeed: -0.03 }            // 前景灌木
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
                instance.rotation.x = Math.PI / 2 - Math.PI * 0.05;
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
            
            // 只有当速度不为0时才移动
            if (Math.abs(this.speed) > 0.0001) {
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
    }
    
    setSpeed(newSpeed) {
        // 确保新速度为数字
        if (typeof newSpeed === 'number' && !isNaN(newSpeed)) {
            this.speed = newSpeed;
        } else {
            console.error('setSpeed收到无效速度:', newSpeed);
        }
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
    
    // 路人层的特殊处理，不在这里初始化，使用动态生成
    if (layer.isPedestrian) {
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
            
            // 创建路人函数
            function createPedestrian(x, isBoarding = true) {
                // 创建新路人
                const pedestrian = new THREE.Mesh(geometry.clone(), material.clone());
                
                // 设置位置
                pedestrian.position.x = x;
                pedestrian.position.y = layer.y;
                pedestrian.position.z = layer.zPosition;
                
                // 添加标记和数据
                pedestrian.userData = {
                    isPedestrian: true,
                    isBoarding: isBoarding, // true表示会上车，false表示是下车后的路人
                    speed: passengerSystem.pedestrianSpeed * (0.8 + Math.random() * 0.4), // 速度有随机变化
                    walkAnimTimer: Math.random() * Math.PI * 2, // 走路动画计时器随机初始化以错开走路节奏
                    walkAnimSpeed: 20 + Math.random() * 20, // 走路频率
                    walkAnimHeight: 0.015, // 走路上下幅度
                    tiltAmount: 0// 倾斜幅度
                };
                
                // 添加到场景
                scene.add(pedestrian);
                
                // 添加到路人数组
                passengerSystem.pedestrians.push(pedestrian);
                
                return pedestrian;
            }
            
            // 暴露创建路人函数到全局
            window.createPedestrian = createPedestrian;
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

// 等待DOM完全加载后再初始化按钮
function initializeBusButton() {
    console.log('初始化巴士控制按钮');
    
    // 获取按钮元素
    const toggleBusBtn = document.getElementById('toggle-bus-btn');
    const addPassengerBtn = document.getElementById('add-passenger-btn');
    const testChatBtn = document.getElementById('test-chat-btn');
    
    if (!toggleBusBtn) {
        console.error('找不到巴士控制按钮!');
        
        // 如果找不到按钮，尝试再次创建
        setTimeout(() => {
            const controlPanel = document.getElementById('control-panel');
            if (controlPanel) {
                if (!document.getElementById('toggle-bus-btn')) {
                    const newBtn = document.createElement('button');
                    newBtn.id = 'toggle-bus-btn';
                    newBtn.textContent = '停车';
                    newBtn.className = 'running';
                    controlPanel.appendChild(newBtn);
                    console.log('动态创建了巴士控制按钮');
                    
                    // 为新创建的按钮注册事件
                    initializeBusButton();
                }
            } else {
                console.error('找不到控制面板元素!');
            }
        }, 500);
        return;
    }
    
    console.log('找到巴士控制按钮，初始化状态');
    
    // 设置初始状态
    toggleBusBtn.textContent = busAnimation.isMoving ? '停车' : '发车';
    toggleBusBtn.className = busAnimation.isMoving ? 'running' : 'stopped';
    
    // 移除可能已存在的事件监听以避免重复
    toggleBusBtn.removeEventListener('click', busButtonClickHandler);
    
    // 添加新的事件监听
    toggleBusBtn.addEventListener('click', busButtonClickHandler);
    
    // 添加乘客按钮事件
    if (addPassengerBtn) {
        addPassengerBtn.removeEventListener('click', addPassengerButtonClickHandler);
        addPassengerBtn.addEventListener('click', addPassengerButtonClickHandler);
    }
    
    // 添加测试对话按钮事件
    if (testChatBtn) {
        testChatBtn.removeEventListener('click', testChatButtonClickHandler);
        testChatBtn.addEventListener('click', testChatButtonClickHandler);
        
        // 更新测试对话按钮文本，显示已对话的乘客数
        updateTestChatButtonText();
    }
    
    console.log('巴士控制按钮初始化完成');
}

// 更新测试对话按钮文本
function updateTestChatButtonText() {
    const testChatBtn = document.getElementById('test-chat-btn');
    if (testChatBtn) {
        if (passengerSystem.chatSystem.chattedSeats.size > 0) {
            testChatBtn.textContent = `测试对话 (${passengerSystem.chatSystem.chattedSeats.size})`;
        } else {
            testChatBtn.textContent = '测试对话';
        }
        
        // 添加提示说明
        testChatBtn.title = '点击触发乘客对话\n' +
            '按住Shift键点击可重置所有乘客的对话状态\n' + 
            '按住Alt键点击可重置已使用的对话内容\n' +
            '按住Ctrl键点击可检查无法触发对话的座位\n' +
            '按住Alt+Shift键点击可修复计时器问题';
    }
}

// 按钮点击处理函数
function busButtonClickHandler(event) {
    console.log('巴士控制按钮被点击');
    
    // 切换巴士状态
    busAnimation.isMoving = !busAnimation.isMoving;
    
    // 更新按钮文本和样式
    const btn = event.target;
    btn.textContent = busAnimation.isMoving ? '停车' : '发车';
    btn.className = busAnimation.isMoving ? 'running' : 'stopped';
    
    console.log('巴士状态已切换为:', busAnimation.isMoving ? '运动' : '停止');
    
    // 如果是发车，检查是否触发对话
    if (busAnimation.isMoving) {
        // 检查是否有可以触发对话的乘客
        tryTriggerConversation();
    }
}

// 添加乘客按钮点击处理函数
function addPassengerButtonClickHandler() {
    console.log('添加乘客按钮被点击');
    
    // 检查是否有空座位
    const emptySeat = seatSystem.getRandomEmptySeat();
    if (emptySeat) {
        // 创建新乘客对象
        const travelTime = 30 + Math.floor(Math.random() * 31); // 30-60秒的随机行程时间
        const passenger = {
            remainingTime: travelTime,
            originalTime: travelTime,
            seatId: emptySeat.id
        };
        
        // 将乘客添加到系统并占用座位
        passengerSystem.passengers.push(passenger);
        seatSystem.occupySeat(emptySeat.id, passenger);
        
        console.log('已添加乘客到座位：', emptySeat.id);
    } else {
        console.log('巴士座位已满，无法添加更多乘客');
        alert('巴士座位已满，无法添加更多乘客');
    }
}

// 测试对话按钮点击处理函数
function testChatButtonClickHandler(event) {
    console.log('测试对话按钮被点击');
    
    // 检查是否是同时按住Alt+Shift键（重置所有乘客计时器）
    if (event && event.altKey && event.shiftKey) {
        // 修复可能卡住的乘客
        let fixedCount = 0;
        
        // 检查所有乘客
        passengerSystem.passengers.forEach(passenger => {
            // 处理剩余时间为负的乘客
            if (passenger.remainingTime <= 0) {
                // 将其标记为等待下车
                if (!passenger.isWaiting) {
                    passenger.isWaiting = true;
                    passenger.waitingCountUpdated = true;
                    fixedCount++;
                }
            } else if (passenger.remainingTime > 30) {
                // 修复可能很大的计时器值
                passenger.remainingTime = 5; // 设置一个较短的时间
                fixedCount++;
            }
        });
        
        // 更新等待下车的乘客计数
        passengerSystem.waitingCount = passengerSystem.passengers.filter(p => 
            p.isWaiting && p.waitingCountUpdated).length;
        
        // 显示提示
        if (fixedCount > 0) {
            alert(`已修复 ${fixedCount} 个乘客计时器问题。\n如果巴士停止，等待下车的乘客会在几秒内下车。`);
        } else {
            alert('没有发现需要修复的乘客计时器问题。');
        }
        return;
    }
    
    // 检查是否按住Ctrl键（检查无法触发对话的座位）
    if (event && event.ctrlKey) {
        // 获取所有占用的座位
        const occupiedSeats = seatSystem.seats.filter(seat => seat.occupied);
        // 获取所有已经参与过对话的座位ID
        const chattedSeatsIds = Array.from(passengerSystem.chatSystem.chattedSeats);
        
        // 过滤出已占用但也被标记为已对话的座位
        const blockedSeats = occupiedSeats.filter(seat => 
            chattedSeatsIds.includes(seat.id)
        );
        
        // 获取可能的座位对
        const seatPairs = [
            ["seat-1-1-1", "seat-1-1-2"],
            ["seat-2-1-1", "seat-2-1-2"],
            ["seat-4-1-1", "seat-4-1-2"],
            ["seat-5-1-1", "seat-5-1-2"]
        ];
        
        // 检查有多少座位对因为至少一个座位被标记为已对话而无法触发对话
        let blockedPairs = 0;
        let detailedInfo = [];
        
        for (const pair of seatPairs) {
            const seat1 = seatSystem.seats.find(s => s.id === pair[0]);
            const seat2 = seatSystem.seats.find(s => s.id === pair[1]);
            
            // 只有当两个座位都被占用，且至少一个被标记为已对话时才算作阻塞
            if (seat1 && seat2 && seat1.occupied && seat2.occupied) {
                const seat1Blocked = passengerSystem.chatSystem.chattedSeats.has(seat1.id);
                const seat2Blocked = passengerSystem.chatSystem.chattedSeats.has(seat2.id);
                
                if (seat1Blocked || seat2Blocked) {
                    blockedPairs++;
                    detailedInfo.push(`座位对 ${pair[0]},${pair[1]}: ${seat1Blocked ? '左侧被阻塞' : ''} ${seat2Blocked ? '右侧被阻塞' : ''}`);
                }
            }
        }
        
        // 显示详细信息
        let message = `当前有 ${blockedSeats.length} 个座位被标记为已参与对话，${blockedPairs} 对座位无法触发对话。\n\n`;
        
        if (detailedInfo.length > 0) {
            message += detailedInfo.join('\n') + '\n\n';
        }
        
        message += '您可以按住Shift键点击"测试对话"按钮来重置所有座位的对话状态。';
        alert(message);
        
        return;
    }
    
    // 检查是否是按住Alt键（重置已使用对话内容）
    if (event && event.altKey) {
        // 重置已使用对话内容
        passengerSystem.usedConversations.clear();
        console.log('已重置所有对话内容使用记录');
        alert('已重置对话内容使用记录，所有对话内容都可以再次触发。');
        return;
    }
    
    // 检查是否是长按（按住Shift键）
    if (event && event.shiftKey) {
        // 长按重置所有已对话乘客的状态
        passengerSystem.chatSystem.chattedSeats.clear();
        
        // 检查并修复已经被释放但仍标记为occupied的座位
        seatSystem.seats.forEach(seat => {
            const seatElement = document.getElementById(seat.id);
            if (seatElement) {
                const hasPassengerElement = !!seatElement.querySelector('.passenger');
                // 如果座位状态与视觉不一致，修复它
                if (seat.occupied !== hasPassengerElement) {
                    console.log(`修复座位不一致: ${seat.id}, occupied=${seat.occupied}, 有乘客元素=${hasPassengerElement}`);
                    seat.occupied = hasPassengerElement;
                    if (!hasPassengerElement) {
                        seat.passenger = null;
                    }
                }
            }
        });
        
        // 同步乘客数组与座位状态
        passengerSystem.passengers = passengerSystem.passengers.filter(p => {
            const seat = seatSystem.seats.find(s => s.id === p.seatId);
            return seat && seat.occupied;
        });
        
        console.log('已重置所有乘客的对话状态和座位');
        updateTestChatButtonText();
        alert('已重置所有乘客的对话状态和座位，修复了可能被锁定的座位。现在所有乘客都可以再次对话。');
        return;
    }
    
    // 如果当前有对话正在进行，先结束它
    if (passengerSystem.chatSystem.isChattingActive) {
        // 先重置当前正在对话的乘客高亮样式
        passengerSystem.chatSystem.activeChatters.forEach(seat => {
            const seatId = seat.id;
            console.log(`在测试对话中重置乘客样式：${seatId}`);
            
            const seatElement = document.getElementById(seatId);
            if (seatElement) {
                const passengerElement = seatElement.querySelector('.passenger');
                if (passengerElement) {
                    passengerElement.style.backgroundColor = '#000';
                    passengerElement.style.boxShadow = 'none';
                    passengerElement.classList.remove('chatting');
                }
            }
        });
        
        // 清空活跃对话者列表
        passengerSystem.chatSystem.activeChatters = [];
        
        // 然后隐藏对话气泡并重置状态
        hideChatBubble();
        passengerSystem.chatSystem.currentDialogue = null;
        passengerSystem.chatSystem.currentDialogueIndex = 0;
        passengerSystem.chatSystem.isChattingActive = false;
    }
    
    // 自动添加乘客到一对座位上，确保有乘客可以对话
    const targetSeats = [
        ["seat-1-1-1", "seat-1-1-2"],
        ["seat-2-1-1", "seat-2-1-2"],
        ["seat-4-1-1", "seat-4-1-2"],
        ["seat-5-1-1", "seat-5-1-2"]
    ];
    
    // 寻找未参与过对话的座位对
    let availablePairs = [];
    
    for (const pair of targetSeats) {
        const seat1 = seatSystem.seats.find(s => s.id === pair[0]);
        const seat2 = seatSystem.seats.find(s => s.id === pair[1]);
        
        // 检查这对座位是否都未参与过对话
        if (!passengerSystem.chatSystem.chattedSeats.has(pair[0]) && 
            !passengerSystem.chatSystem.chattedSeats.has(pair[1])) {
            availablePairs.push(pair);
        }
    }
    
    // 如果没有可用座位对，提示用户而不是重用已对话的座位对
    if (availablePairs.length === 0) {
        console.log('所有座位对都已经参与过对话');
        alert('所有可用的座位对都已经参与过对话。\n提示：按住Shift键点击"测试对话"按钮可以重置所有乘客的对话状态。');
        return;
    }
    
    // 随机选择一对座位
    const randomPairIndex = Math.floor(Math.random() * availablePairs.length);
    const targetPair = availablePairs[randomPairIndex];
    
    // 检查并填充这对座位
    for (const seatId of targetPair) {
        const seat = seatSystem.seats.find(s => s.id === seatId);
        if (seat && !seat.occupied) {
            // 创建新乘客对象
            const travelTime = 10 + Math.floor(Math.random() * 20);
            const passenger = {
                remainingTime: travelTime,
                originalTime: travelTime,
                seatId: seatId
            };
            
            // 将乘客添加到系统并占用座位
            passengerSystem.passengers.push(passenger);
            seatSystem.occupySeat(seatId, passenger);
            console.log('已添加乘客到座位：', seatId);
        }
    }
    
    // 查找可能的对话乘客
    const possibleChatters = findPotentialChatters();
    console.log('找到可能对话乘客数量：', possibleChatters.length);
    
    if (possibleChatters.length >= 2) {
        // 因为我们按座位对获取的乘客，所以必须成对选择
        const pairCount = Math.floor(possibleChatters.length / 2);
        const pairIndex = Math.floor(Math.random() * pairCount);
        
        // 选择一对乘客（相邻索引）
        const chatter1 = possibleChatters[pairIndex * 2];
        const chatter2 = possibleChatters[pairIndex * 2 + 1];
        
        console.log('选择对话的座位：', chatter1.id, chatter2.id);
        
        // 将这些座位设置为正在对话状态
        passengerSystem.chatSystem.activeChatters = [chatter1, chatter2];
        
        // 高亮显示正在对话的乘客
        highlightChatters([chatter1, chatter2]);
        
        // 获取随机对话内容
        const dialogueContent = getRandomConversation();
        console.log('选择的对话内容：', dialogueContent);
        passengerSystem.chatSystem.currentDialogue = dialogueContent;
        passengerSystem.chatSystem.currentDialogueIndex = 0;
        
        // 显示第一句对话
        showCurrentDialogueMessage();
        
        // 设置对话状态
        passengerSystem.chatSystem.isChattingActive = true;
    } else {
        console.log('没有足够的乘客可以进行对话测试，请先添加更多乘客');
        alert('没有足够的乘客可以进行对话测试，请先添加更多乘客。\n提示：按住Shift键点击"测试对话"按钮可以重置所有乘客的对话状态。');
    }
}

// 使用多种方式确保按钮初始化
// 1. 直接调用（可能DOM尚未准备好）
setTimeout(initializeBusButton, 500);

// 2. DOMContentLoaded事件
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM内容已加载，初始化按钮');
    initializeBusButton();
    
    // 添加键盘快捷键支持
    document.addEventListener('keydown', (event) => {
        // 空格键 - 暂停/启动巴士
        if (event.code === 'Space') {
            const toggleBusBtn = document.getElementById('toggle-bus-btn');
            if (toggleBusBtn) {
                toggleBusBtn.click();
            }
        }
        
        // 数字键1 - 添加乘客
        if (event.code === 'Digit1' || event.code === 'Numpad1') {
            const addPassengerBtn = document.getElementById('add-passenger-btn');
            if (addPassengerBtn) {
                addPassengerBtn.click();
            }
        }
        
        // 数字键2 - 测试对话
        if (event.code === 'Digit2' || event.code === 'Numpad2') {
            const testChatBtn = document.getElementById('test-chat-btn');
            if (testChatBtn) {
                testChatBtn.click();
            }
        }
        
        // N键 - 显示下一句对话
        if (event.code === 'KeyN' && passengerSystem.chatSystem.isChattingActive) {
            // 强制显示下一句对话
            showCurrentDialogueMessage();
        }
    });
});

// 3. window.load事件
window.addEventListener('load', () => {
    console.log('页面完全加载，初始化按钮');
    setTimeout(initializeBusButton, 100);
});

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
    
    // 取得当前电线杆速度
    const poleSpeed = layerObjects["img_bg2_pole"].speed;
    
    // 更新所有电线杆位置，只有当速度不为0时才移动
    let needCreateNewWires = false;
    
    if (Math.abs(poleSpeed) > 0.0001) {
        for (let i = poles.length - 1; i >= 0; i--) {
            const pole = poles[i];
            pole.position.x += poleSpeed;
            
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
    
    // 更新计时器，只有当巴士在运动状态时才增加计时
    if (busAnimation.currentSpeedFactor > 0.001) {
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
}

// 上一帧的时间戳
let lastTime = 0;

// 动画循环
function animate(timestamp) {
    requestAnimationFrame(animate);
    
    // 计算帧间隔时间（秒）
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    // 初始化座位系统（如果尚未初始化）
    if (!seatSystem.initialized) {
        seatSystem.initializeSeats();
        seatSystem.initialized = true;
    }
    
    // 更新巴士运动状态
    let prevSpeedFactor = busAnimation.currentSpeedFactor;
    
    if (busAnimation.isMoving) {
        // 巴士正在运行，需要逐渐加速到满速
        busAnimation.currentSpeedFactor = Math.min(busAnimation.currentSpeedFactor + busAnimation.acceleration * deltaTime, 1.0);
    } else {
        // 巴士正在停止，需要逐渐减速到0
        busAnimation.currentSpeedFactor = Math.max(busAnimation.currentSpeedFactor - busAnimation.deceleration * deltaTime, 0.0);
    }
    
    // 防止数值过小导致精度问题
    if (Math.abs(busAnimation.currentSpeedFactor) < 0.001) {
        busAnimation.currentSpeedFactor = 0;
    }
    
    // 如果速度因子变化，打印日志
    if (Math.abs(prevSpeedFactor - busAnimation.currentSpeedFactor) > 0.01) {
        console.log('速度因子更新:', busAnimation.currentSpeedFactor.toFixed(2));
    }
    
    // 根据当前速度因子更新所有图层的速度
    for (const layer of layers) {
        if (layer.defaultSpeed !== undefined) {
            const newSpeed = layer.defaultSpeed * busAnimation.currentSpeedFactor;
            layer.speed = newSpeed;
            
            // 更新对应的图层管理器
            if (layerManagers[layer.name]) {
                layerManagers[layer.name].setSpeed(newSpeed);
            }
        }
    }
    
    // 更新电线杆的速度
    if (layerObjects["img_bg2_pole"]) {
        const poleLayer = layers.find(l => l.name === "img_bg2_pole");
        if (poleLayer) {
            layerObjects["img_bg2_pole"].speed = poleLayer.speed;
        }
    }
    
    // 根据当前速度因子更新巴士的震动和摆动效果
    busAnimation.vibrationSpeed = busAnimation.maxVibrationSpeed * busAnimation.currentSpeedFactor;
    // 相机摇摆速度也随巴士状态变化
    cameraSwing.speed = 0.005 * busAnimation.currentSpeedFactor;
    // 巴士Y轴偏移也随状态变化
    busAnimation.yOffsetSpeed = 0.4 * busAnimation.currentSpeedFactor;
    
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
            // 小屋速度也受到巴士运行状态的影响
            const houseLayer = layers.find(l => l.isHouse);
            if (houseLayer) {
                house.userData.speed = Math.abs(houseLayer.speed) + Math.random() * 0.005 * busAnimation.currentSpeedFactor;
            }
            
            // 只有当速度足够大时才移动小屋
            if (busAnimation.currentSpeedFactor > 0.001) {
                house.position.x += house.userData.speed;
            }
            
            // 如果小屋移出屏幕右侧很远，移除它
            if (house.position.x > SCREEN_BOUNDARY.right + 10) {
                scene.remove(house);
                houses.splice(i, 1);
            }
        }
        
        // 更新小屋计时器，只有当巴士在运动时才创建新小屋
        if (busAnimation.currentSpeedFactor > 0.001) {
            houseTimer += deltaTime;
            
            // 当计时器超过当前刷新间隔时，创建新小屋
            if (houseTimer >= currentHouseInterval && window.createHouse) {
                window.createHouse();
            }
        }
    }
    
    // 更新乘客和路人系统
    updatePassengerSystem(deltaTime);
    
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

// 创建下车提示UI
function createPassengerNotification() {
    // 如果已经存在提示元素，则返回
    if (passengerSystem.passengerCountElement) {
        return;
    }
    
    // 创建到站乘客数量显示
    const passengerCountUI = document.createElement('div');
    passengerCountUI.id = 'passenger-count';
    passengerCountUI.innerHTML = '到站人数: 0';
    passengerCountUI.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background-color: rgba(52, 152, 219, 0.8);
        color: white;
        padding: 8px 15px;
        border-radius: 15px;
        font-size: 16px;
        font-weight: bold;
        z-index: 1000;
    `;
    
    document.body.appendChild(passengerCountUI);
    passengerSystem.passengerCountElement = passengerCountUI;
    
    // 创建乘客故事按钮
    const storyButton = document.createElement('button');
    storyButton.id = 'passenger-story-btn';
    storyButton.innerHTML = '田园轶闻: 0';
    storyButton.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: rgba(46, 204, 113, 0.8);
        color: white;
        padding: 8px 15px;
        border-radius: 15px;
        font-size: 16px;
        font-weight: bold;
        border: none;
        cursor: pointer;
        z-index: 1000;
        transition: all 0.2s ease;
    `;
    
    // 添加悬停效果
    storyButton.addEventListener('mouseover', () => {
        storyButton.style.backgroundColor = 'rgba(46, 204, 113, 1)';
        storyButton.style.transform = 'scale(1.05)';
    });
    
    storyButton.addEventListener('mouseout', () => {
        storyButton.style.backgroundColor = 'rgba(46, 204, 113, 0.8)';
        storyButton.style.transform = 'scale(1)';
    });
    
    // 添加点击事件
    storyButton.addEventListener('click', showChatHistory);
    
    document.body.appendChild(storyButton);
}

// 显示乘客下车提示(已弃用，保留函数以兼容调用)
function showPassengerNotification() {
    if (!passengerSystem.passengerCountElement) {
        createPassengerNotification();
    }
    // 设置标志，表示有乘客等待下车
    passengerSystem.notificationShown = true;
}

// 隐藏乘客下车提示(已弃用，保留函数以兼容调用)
function hidePassengerNotification() {
    // 重置标志，表示没有乘客等待下车
    passengerSystem.notificationShown = false;
}

// 生成路人
function spawnPedestrians() {
    // 随机生成3-6个路人
    const count = 3 + Math.floor(Math.random() * 4);
    console.log(`生成 ${count} 个路人`);
    
    // 在屏幕左侧可见区域生成路人
    for (let i = 0; i < count; i++) {
        // 随机位置，确保不会重叠但在屏幕左侧可见
        const x = -8 - i * 1.2 - Math.random() * 1.2;
        window.createPedestrian(x);
    }
}

// 更新路人
function updatePedestrians(deltaTime) {
    if (passengerSystem.pedestrians.length === 0) {
        return;
    }
    
    // 获取道路图层的当前速度
    const roadLayer = layers.find(l => l.name === "img_bg1_road");
    const roadSpeed = roadLayer ? roadLayer.speed : -0.03 * busAnimation.currentSpeedFactor;
    
    // 遍历所有路人
    for (let i = passengerSystem.pedestrians.length - 1; i >= 0; i--) {
        const pedestrian = passengerSystem.pedestrians[i];
        
        // 获取路人原始Y位置（从layers数组中）
        const pedLayer = layers.find(layer => layer.isPedestrian);
        const baseY = pedLayer ? pedLayer.y : -1.4;
        
        // 路人移动逻辑
        if (pedestrian.userData.isBoarding) {
            // 如果巴士停止，路人会向巴士移动
            if (!busAnimation.isMoving && busAnimation.currentSpeedFactor < 0.01) {
                // 计算朝向巴士的移动
                const directionToBus = Math.sign(bus.position.x - pedestrian.position.x);
                pedestrian.position.x += directionToBus * pedestrian.userData.speed * deltaTime;
                
                // 更新走路动画计时器
                pedestrian.userData.walkAnimTimer += pedestrian.userData.walkAnimSpeed * deltaTime;
                
                // 应用走路上下摆动效果
                pedestrian.position.y = baseY + Math.sin(pedestrian.userData.walkAnimTimer) * pedestrian.userData.walkAnimHeight;
                
                // 应用前后倾斜效果，与上下运动相位差90度，使用余弦
                pedestrian.rotation.z = Math.cos(pedestrian.userData.walkAnimTimer) * pedestrian.userData.tiltAmount;
                
                // 如果路人到达了巴士位置附近（考虑巴士宽度的一半）
                if (Math.abs(pedestrian.position.x - bus.position.x) < 1.0) {
                    // 检查是否有空座位
                    const emptySeat = seatSystem.getRandomEmptySeat();
                    if (emptySeat) {
                        // 乘客上车
                        console.log('乘客上车，坐在座位：', emptySeat.id);
                        
                        // 创建新乘客对象
                        const travelTime = 30 + Math.floor(Math.random() * 31); // 30-60秒的随机行程时间
                        const passenger = {
                            remainingTime: travelTime,
                            originalTime: travelTime,
                            seatId: emptySeat.id
                        };
                        
                        // 将乘客添加到系统并占用座位
                        passengerSystem.passengers.push(passenger);
                        seatSystem.occupySeat(emptySeat.id, passenger);
                        
                        // 移除路人对象
                        scene.remove(pedestrian);
                        passengerSystem.pedestrians.splice(i, 1);
                    } else {
                        console.log('巴士座位已满，乘客无法上车');
                        // 将路人设为继续行走，不再尝试上车
                        pedestrian.userData.isBoarding = false;
                    }
                }
            } else {
                // 巴士在运动，路人应该随着道路移动（相对于道路静止）
                pedestrian.position.x -= roadSpeed;
                
                // 路人在站立等待时不应有走路动画
                pedestrian.position.y = baseY;
                pedestrian.rotation.z = 0; // 站立时不倾斜
            }
        } else {
            // 下车后的路人，向右走离开，速度是路人自身速度加上道路带来的相对速度
            pedestrian.position.x += pedestrian.userData.speed * 1.5 * deltaTime - roadSpeed;
            
            // 更新走路动画计时器
            pedestrian.userData.walkAnimTimer += pedestrian.userData.walkAnimSpeed * deltaTime;
            
            // 应用走路上下摆动效果
            pedestrian.position.y = baseY + Math.sin(pedestrian.userData.walkAnimTimer) * pedestrian.userData.walkAnimHeight;
            
            // 应用前后倾斜效果
            pedestrian.rotation.z = Math.cos(pedestrian.userData.walkAnimTimer) * pedestrian.userData.tiltAmount;
        }
        
        // 如果路人移出屏幕，移除它
        if (pedestrian.position.x > SCREEN_BOUNDARY.right) {
            scene.remove(pedestrian);
            passengerSystem.pedestrians.splice(i, 1);
        }
    }
}

// 创建对话气泡UI
function createChatBubble() {
    // 如果已经存在对话气泡元素，则返回
    if (passengerSystem.chatSystem.chatBubbleElement) {
        return;
    }
    
    // 创建对话气泡元素
    const chatBubble = document.createElement('div');
    chatBubble.id = 'chat-bubble';
    chatBubble.style.cssText = `
        position: fixed;
        top: 84.5%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.8);
        background-color: #fff;
        color: #000;
        padding: 12px 18px;
        border-radius: 15px;
        font-size: 14px;
        z-index: 1001;
        display: none;
        width: 85%;
        max-width: 800px;
        text-align: center;
        border: 1px solid #000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        opacity: 0;
        transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    
    // 将对话气泡添加到body中
    document.body.appendChild(chatBubble);
    passengerSystem.chatSystem.chatBubbleElement = chatBubble;
}

// 显示对话气泡
function showChatBubble(message) {
    if (!passengerSystem.chatSystem.chatBubbleElement) {
        createChatBubble();
    }
    
    if (passengerSystem.chatSystem.chatBubbleElement) {
        const chatBubble = passengerSystem.chatSystem.chatBubbleElement;
        
        // 先重置动画状态
        chatBubble.style.opacity = '0';
        chatBubble.style.transform = 'translate(-50%, -50%) scale(0.8)';
        chatBubble.style.display = 'block';
        chatBubble.textContent = message;
        
        // 使用requestAnimationFrame确保样式变化生效
        requestAnimationFrame(() => {
            // 触发回弹动画
            chatBubble.style.opacity = '1';
            chatBubble.style.transform = 'translate(-50%, -50%) scale(1.05)';
            
            // 添加一个额外的动画帧来实现回弹效果
            setTimeout(() => {
                chatBubble.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 150);
        });
    }
}

// 隐藏对话气泡
function hideChatBubble() {
    if (passengerSystem.chatSystem.chatBubbleElement) {
        const chatBubble = passengerSystem.chatSystem.chatBubbleElement;
        console.log('隐藏对话气泡');
        
        // 先应用动画效果
        chatBubble.style.opacity = '0';
        chatBubble.style.transform = 'translate(-50%, -50%) scale(0.8)';
        
        // 先执行重置乘客样式的操作，避免延时导致的问题
        // 重置活跃对话者
        passengerSystem.chatSystem.activeChatters.forEach(seat => {
            const seatId = seat.id;
            console.log('重置对话者座位样式：', seatId);
            
            const seatElement = document.getElementById(seatId);
            if (seatElement) {
                const passengerElement = seatElement.querySelector('.passenger');
                if (passengerElement) {
                    passengerElement.style.backgroundColor = '#000';
                    passengerElement.style.boxShadow = 'none';
                    passengerElement.classList.remove('chatting');
                }
            }
        });
        
        // 标记对话已结束
        const dialogueCompleted = passengerSystem.chatSystem.currentDialogue === null || 
                                passengerSystem.chatSystem.currentDialogueIndex >= passengerSystem.chatSystem.currentDialogue.length;
        
        // 如果对话未完成，且存在活跃对话者，则不要将其添加到chattedSeats
        if (!dialogueCompleted && passengerSystem.chatSystem.activeChatters.length > 0) {
            console.log('对话被中止，不标记座位为已对话');
        }
        
        // 清空活跃对话者数组并重置状态
        passengerSystem.chatSystem.activeChatters = [];
        passengerSystem.chatSystem.isChattingActive = false;
        
        // 动画结束后隐藏元素
        setTimeout(() => {
            chatBubble.style.display = 'none';
            console.log('对话已停用，chattedSeats大小:', passengerSystem.chatSystem.chattedSeats.size);
            
            // 检查是否有乘客等待下车但被锁定
            const lockedPassengers = passengerSystem.passengers.filter(p => 
                p.isWaiting && !p.waitingCountUpdated);
                
            if (lockedPassengers.length > 0) {
                console.log(`发现 ${lockedPassengers.length} 个锁定的等待下车乘客，现在修复`);
                lockedPassengers.forEach(p => {
                    p.waitingCountUpdated = true;
                });
                passengerSystem.waitingCount += lockedPassengers.length;
            }
        }, 150); // 等待动画完成
    }
}

// 检查是否可以触发对话
function checkForConversation(deltaTime) {
    // 此函数已不再需要，被新的对话触发机制取代
}

// 尝试触发对话的新函数
function tryTriggerConversation() {
    // 如果已经有对话在进行，不触发新对话
    if (passengerSystem.chatSystem.isChattingActive) {
        return false;
    }
    
    // 检查是否还有未参与对话的座位对
    const seatPairs = [
        ["seat-1-1-1", "seat-1-1-2"],
        ["seat-2-1-1", "seat-2-1-2"],
        ["seat-4-1-1", "seat-4-1-2"],
        ["seat-5-1-1", "seat-5-1-2"]
    ];
    
    let hasAvailablePairs = false;
    
    for (const pair of seatPairs) {
        const seat1 = seatSystem.seats.find(s => s.id === pair[0]);
        const seat2 = seatSystem.seats.find(s => s.id === pair[1]);
        
        // 检查是否有未参与对话且被占用的座位对
        if (seat1 && seat2 && 
            seat1.occupied && seat2.occupied && 
            !passengerSystem.chatSystem.chattedSeats.has(seat1.id) && 
            !passengerSystem.chatSystem.chattedSeats.has(seat2.id)) {
            hasAvailablePairs = true;
            break;
        }
    }
    
    // 如果没有可用的座位对，不触发对话
    if (!hasAvailablePairs) {
        return false;
    }
    
    // 寻找同排可能对话的乘客
    const possibleChatters = findPotentialChatters();
    console.log('找到可能对话乘客数量：', possibleChatters.length);
    
    if (possibleChatters.length >= 2) {
        // 因为我们按座位对获取的乘客，所以必须成对选择
        const pairCount = Math.floor(possibleChatters.length / 2);
        const pairIndex = Math.floor(Math.random() * pairCount);
        
        // 选择一对乘客（相邻索引）
        const chatter1 = possibleChatters[pairIndex * 2];
        const chatter2 = possibleChatters[pairIndex * 2 + 1];
        
        console.log('选择对话的座位：', chatter1.id, chatter2.id);
        console.log('这些座位是否已经参与过对话：', 
            passengerSystem.chatSystem.chattedSeats.has(chatter1.id), 
            passengerSystem.chatSystem.chattedSeats.has(chatter2.id));
        
        // 将这些座位设置为正在对话状态
        passengerSystem.chatSystem.activeChatters = [chatter1, chatter2];
        
        // 高亮显示正在对话的乘客
        highlightChatters([chatter1, chatter2]);
        
        // 获取随机对话内容
        const dialogueContent = getRandomConversation();
        console.log('选择的对话内容：', dialogueContent);
        passengerSystem.chatSystem.currentDialogue = dialogueContent;
        passengerSystem.chatSystem.currentDialogueIndex = 0;
        
        // 显示第一句对话
        showCurrentDialogueMessage();
        
        // 设置对话状态
        passengerSystem.chatSystem.isChattingActive = true;
        
        return true;
    }
    
    return false;
}

// 查找可能对话的乘客（同一排双人座的乘客）
function findPotentialChatters() {
    const chatters = [];
    
    // 检查每一排的左侧双人座
    const seatPairs = [
        ["seat-1-1-1", "seat-1-1-2"],
        ["seat-2-1-1", "seat-2-1-2"],
        ["seat-4-1-1", "seat-4-1-2"],
        ["seat-5-1-1", "seat-5-1-2"]
    ];
    
    console.log('开始查找可能对话的乘客，当前乘客总数：', passengerSystem.passengers.length);
    console.log('已参与过对话的座位数：', passengerSystem.chatSystem.chattedSeats.size);
    console.log('已参与过对话的座位：', Array.from(passengerSystem.chatSystem.chattedSeats));
    
    for (const pair of seatPairs) {
        const seat1 = seatSystem.seats.find(s => s.id === pair[0]);
        const seat2 = seatSystem.seats.find(s => s.id === pair[1]);
        
        console.log(`检查座位对: ${pair[0]}, ${pair[1]}`);
        console.log('座位1状态:', seat1 ? `找到，占用=${seat1.occupied}` : '未找到');
        console.log('座位2状态:', seat2 ? `找到，占用=${seat2.occupied}` : '未找到');
        console.log('座位1已参与对话:', passengerSystem.chatSystem.chattedSeats.has(pair[0]));
        console.log('座位2已参与对话:', passengerSystem.chatSystem.chattedSeats.has(pair[1]));
        
        // 检查是否有效座位对（两个座位都被占用且都未参与过对话）
        if (seat1 && seat2 && 
            seat1.occupied && seat2.occupied && 
            !passengerSystem.chatSystem.chattedSeats.has(seat1.id) && 
            !passengerSystem.chatSystem.chattedSeats.has(seat2.id)) {
            
            console.log('找到可能对话的乘客对：', seat1.id, seat2.id);
            chatters.push(seat1);
            chatters.push(seat2);
        }
    }
    
    return chatters;
}

// 高亮显示正在对话的乘客
function highlightChatters(chatters) {
    console.log('开始高亮乘客，数量：', chatters.length);
    
    // 先清除可能存在的所有高亮状态
    // 查找所有带有chatting类的乘客元素
    const chattingPassengers = document.querySelectorAll('.passenger.chatting');
    if (chattingPassengers.length > 0) {
        console.log('发现残留的高亮乘客，数量：', chattingPassengers.length);
        chattingPassengers.forEach(element => {
            element.style.backgroundColor = '#000';
            element.style.boxShadow = 'none';
            element.classList.remove('chatting');
        });
    }
    
    // 高亮新的对话乘客
    chatters.forEach(seat => {
        const seatId = seat.id;
        console.log('正在高亮座位ID：', seatId);
        
        const seatElement = document.getElementById(seatId);
        if (seatElement) {
            console.log('找到座位元素：', seatId);
            const passengerElement = seatElement.querySelector('.passenger');
            
            if (passengerElement) {
                console.log('找到乘客元素，直接设置样式');
                // 使用style直接设置样式，而不是依赖CSS类
                passengerElement.style.backgroundColor = '#fff';
                passengerElement.style.boxShadow = '0 0 5px rgba(255,255,255,0.8)';
                
                // 同时添加chatting类以保持一致性
                passengerElement.classList.add('chatting');
            } else {
                console.error('未找到乘客元素！座位ID:', seatId);
            }
        } else {
            console.error('未找到座位元素! ID:', seatId);
        }
    });
}

// 动态获取对话总数量
function getConversationsCount() {
    return getRandomConversation(true);
}

// 获取随机对话内容
function getRandomConversation(countOnly = false) {
    const conversations = [
        [
            "大叔：今年的麦子看着长得不错啊。",
            "眼镜男：天公作美，最近雨水足，咱们都盼着个好收成呢。",
            "大叔：可不咋地！收成好，娃娃们读书也就有着落了。"
        ],
        [
            "阿姨：小伙子，你是进城打工的吧？",
            "男青年：对，婶儿，趁着这几天厂里放假才回家看看。",
            "阿姨：好啊，出门在外要多注意身体。"
        ],
        [
            "老太太：丫头，这么早就搭车去镇上啊？",
            "年轻姑娘：奶奶，我上学去，今天学校开运动会呢。",
            "老太太：那得吃好饭，奶奶这有饼，给你拿块垫垫。",
            "年轻姑娘：谢谢奶奶，这饼可真香！"
        ],
        [
            "大叔：听说咱们村东头那桥，乡里要拨款修了。",
            "青年农民：是啊，以后去镇上就方便了。",
            "大叔：就盼着修好了，乡亲们赶集赶会也能早回家了。"
        ],
        [
            "中年妇女：哎呀，柱子媳妇，我听说你家闺女定亲了？",
            "柱子媳妇：可不嘛，下个月初八过礼呢，你到时候可得过来坐坐！",
            "中年妇女：那是自然，一定要去的！"
        ],
        [
            "眼镜男：大爷，你家孙子成绩怎么样？",
            "老爷爷：马马虎虎吧，这娃儿贪玩，不过只要为人正直就行啦。",
            "眼镜男：大爷，您想得真开明啊！"
        ],
        [
            "大娘：哟，小姑娘，感冒还没好？",
            "年轻姑娘：好多了，大娘，诊所的大夫给的药挺管用。",
            "大娘：那就好，平时也得多注意穿戴。"
        ],
        [
            "中年男人：老兄，听说昨天你家猪跑村长家菜园去了？",
            "秃顶大叔：唉，别提了，道歉赔礼了一上午，明儿还得补篱笆。",
            "中年男人：哈哈，没事儿，下回我去帮你一起修！"
        ],
        [
            "年轻姑娘：婶儿，今天赶集买啥去呀？",
            "阿姨：给家里买些针头线脑，顺便给娃娃捎点糖果。",
            "年轻姑娘：我也想去看看花布，想自己做条裙子。"
        ],
        [
            "胖大嫂：妹子，我瞅你家孩子可真懂事，见人都叫人。",
            "年轻妈妈：哪啊，这娃在家可淘气了，没少挨他爸揍！",
            "胖大嫂：小孩淘气点是福气啊，不然长大了吃亏呢！"
        ],
        [
            "老汉：二娃，地里的活儿干得咋样了？",
            "壮小伙：差不多了，就差最后一片玉米了。",
            "老汉：成，累了到家来歇歇，婶儿给你蒸包子。"
        ],
        [
            "老大爷：闺女，我听你爸腿摔了？",
            "年轻姑娘：幸亏邻里帮忙，要不我一人还真照顾不过来。",
            "老大爷：远亲不如近邻，有啥事你尽管吱声。"
        ],
        [
            "青年农民：刚才村里广播说，后天镇上有电影看！",
            "戴帽子大叔：上回放的那个《少林寺》我可是看了三遍，这次放啥？",
            "青年农民：《地道战》，经典老片儿，值得再看一回！"
        ],
        [
            "阿姨：你们家新买的牛养得咋样？",
            "瘦大叔：还行，挺听话的，就是吃得多。",
            "阿姨：牲口壮实了，来年春耕就省事不少！"
        ],
        [
            "年轻妈妈：婶儿，你编的箩筐真好看，赶集卖得咋样？",
            "手巧婶婶：还成，回头婶给你家送一个，给娃娃装书本正合适。",
            "年轻妈妈：婶儿，你人真好！"
        ],
        [
            "眼镜青年：大娘，你家院子里那菜咋种的，长势真好。",
            "大娘：没啥诀窍，简单的很，勤浇水勤施肥。",
            "大娘：回头我给你送些菜籽过去，你自个儿也试试。"
        ],
        [
            "中年男人：嫂子，我听你家二宝满月了？",
            "大嫂：可不是么，刚办完满月酒，你咋没过来喝两盅？",
            "中年男人：哎呀，这两天地里活儿实在走不开！",
            "中年男人：改天我再登门去看看娃。",
            "大嫂：没事儿，你忙你的。"
        ],
        [
            "青年：师傅，听说你补鞋手艺好，活儿都干到镇上去了？",
            "补鞋匠：唉，我就是讲个实在，没啥手艺。",
            "青年：您太谦虚啦，镇上人都说您的手艺好着呢！"
        ],
        [
            "草帽大叔：昨天河里钓鱼去啦？",
            "年轻小伙：去了，钓了半天就一条小鲫鱼，还被家里猫叼走了。",
            "草帽大叔：哈哈，那猫倒是有口福，比你还会钓鱼呢！"
        ],
        [
            "老爷爷：小伙子，你骑的这自行车瞅着挺新鲜，是新买的？",
            "男青年：大爷，这是二手的",
            "男青年：前几天在集市淘来的，自己刷的漆。",
            "老爷爷：好，有手艺，能干的年轻人走哪都吃香！"
        ],
        [
            "年轻姑娘：叔，您看这路边的油菜花开得真好看！",
            "大叔：嗯，庄稼好了，风景也跟着好！",
            "年轻姑娘：是啊，我上次带城里的同学来家玩，他们都舍不得走呢。"
        ],
        [
            "阿姨：孩子，新书包真好看，是妈妈缝的？",
            "小学生：是娘用旧衣服做的，说省下的钱给我买课本。",
            "阿姨：你娘可真巧，回头婶儿给你几个铅笔本，好好念书哈。",
            "小学生：谢谢阿姨！"
        ],
        [
            "中年妇女：我看你家院里养的鸡鸭挺多，平时费事不？",
            "胖婶：倒不费啥事，就是得看着点黄鼠狼，这东西可精了。",
            "中年妇女：哈哈，可不咋地，防黄鼠狼跟防贼似的。"
        ],
        [
            "眼镜青年：大伯，这秧苗种多久了，看着长势不错啊。",
            "老伯：种了快俩月了，估摸着秋天能丰收。",
            "眼镜青年：真好，到时候咱乡里又是一片热闹景象。"
        ],
        [
            "扇扇子大娘：这天儿可真热，晚上村头还纳凉不？",
            "青年妇女：还纳呢，每晚可热闹了！",
            "青年妇女：老人唠嗑，孩子们捉迷藏，热天儿也过得舒心。",
            "扇扇子大娘：有伴儿闲话，比啥风扇都管用。"
        ],
        [
            "瘦大叔：嫂子，你家灶上的柴火够用不，我送点过去？",
            "胖大嫂：够用呢，你兄弟前两天刚打了几捆柴，后院堆得满满的。",
            "瘦大叔：成，不够记得招呼一声。"
        ],
        [
            "老奶奶：你们年轻人赶上好时候了，晚上有电灯。",
            "老奶奶：我年轻那会儿煤油灯晃得眼睛疼。",
            "女青年：奶奶，您那时候虽然灯光暗点，可日子肯定也很温暖啊。",
            "老奶奶：哈哈，这话倒是真的，人心齐，煤油灯也照得亮堂！"
        ],
        [
            "年轻姑娘：婶儿，听说你会裁衣服，教教我呗？",
            "巧手婶婶：没问题，回头来家里。",
            "巧手婶婶：手艺这东西，多学一样，以后日子就好过一点。",
            "年轻姑娘：婶儿真好，我明天就去！"
        ],
        [
            "中年男人：现在村里的娃娃们天天早晨还做广播操吧？",
            "眼镜青年：做着呢！早上六点半准时响。",
            "眼镜青年：我这老胳膊老腿的，听见广播也想活动活动。",
            "中年男人：哈哈，一起锻炼，咱乡里的精神气儿就起来了！"
        ],
        [
            "胖大叔：桂花嫂，今年中秋你家还做月饼不？",
            "桂花嫂：做呀，早订了好多，都是邻里街坊的。",
            "桂花嫂：我寻思今年再添点馅儿，大家尝个新鲜。",
            "胖大叔：那可得给我留些，你家月饼味道，吃了一年还惦记呢。"
        ]
    ];
    
    // 如果只是获取对话数量，则直接返回数组长度
    if (countOnly) {
        return conversations.length;
    }
    
    // 获取未使用过的对话
    const availableIndices = [];
    for (let i = 0; i < conversations.length; i++) {
        if (!passengerSystem.usedConversations.has(i)) {
            availableIndices.push(i);
        }
    }
    
    // 如果所有对话都已使用过，重置集合并重新开始
    if (availableIndices.length === 0) {
        console.log('所有对话内容都已使用过，重置使用记录并重新开始');
        passengerSystem.usedConversations.clear();
        
        // 重新填充可用索引
        for (let i = 0; i < conversations.length; i++) {
            availableIndices.push(i);
        }
    }
    
    // 从未使用过的对话中随机选择一个
    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    const selectedIndex = availableIndices[randomIndex];
    
    // 标记该对话为已使用
    passengerSystem.usedConversations.add(selectedIndex);
    console.log(`选择对话索引 ${selectedIndex}，剩余未使用对话数量: ${availableIndices.length - 1}`);
    
    return conversations[selectedIndex];
}

// 显示当前对话句子
function showCurrentDialogueMessage() {
    const currentDialogue = passengerSystem.chatSystem.currentDialogue;
    const currentIndex = passengerSystem.chatSystem.currentDialogueIndex;
    
    if (currentDialogue && currentIndex < currentDialogue.length) {
        const message = currentDialogue[currentIndex];
        showChatBubble(message);
        
        // 如果是对话的第一句，将整个对话添加到历史记录
        if (currentIndex === 0) {
            passengerSystem.chatHistory.unshift([...currentDialogue]); // 使用unshift添加到开头
            // 更新按钮文本
            const storyButton = document.getElementById('passenger-story-btn');
            if (storyButton) {
                storyButton.innerHTML = `田园轶闻: ${passengerSystem.chatHistory.length}`;
                
                // 检查是否收集了全部轶闻
                const totalConversations = getConversationsCount();
                if (passengerSystem.chatHistory.length >= totalConversations && !passengerSystem.allCollectedMessageShown) {
                    // 标记已显示恭喜消息，避免重复显示
                    passengerSystem.allCollectedMessageShown = true;
                    
                    // 在对话结束后显示恭喜消息
                    setTimeout(() => {
                        showAllCollectedMessage();
                    }, (currentDialogue.length - currentIndex) * passengerSystem.chatSystem.chatDuration * 1000 + 500);
                }
            }
        }
        
        // 更新对话索引，准备显示下一句
        passengerSystem.chatSystem.currentDialogueIndex++;
        // 重置对话计时器
        passengerSystem.chatSystem.chatTimer = 0;
    } else {
        // 所有对话句子都已显示完，结束对话
        console.log('对话完成，准备结束对话');
        
        // 先重置乘客高亮样式
        passengerSystem.chatSystem.activeChatters.forEach(seat => {
            const seatId = seat.id;
            console.log(`重置对话结束的乘客样式：${seatId}`);
            
            const seatElement = document.getElementById(seatId);
            if (seatElement) {
                const passengerElement = seatElement.querySelector('.passenger');
                if (passengerElement) {
                    passengerElement.style.backgroundColor = '#000';
                    passengerElement.style.boxShadow = 'none';
                    passengerElement.classList.remove('chatting');
                }
            }
        });
        
        // 将当前对话的乘客添加到已对话集合中
        console.log('当前活跃对话者数量:', passengerSystem.chatSystem.activeChatters.length);
        passengerSystem.chatSystem.activeChatters.forEach(seat => {
            console.log(`将座位 ${seat.id} 标记为已参与过对话`);
            passengerSystem.chatSystem.chattedSeats.add(seat.id);
        });
        
        // 更新测试对话按钮文本
        updateTestChatButtonText();
        
        // 完全重置对话状态
        console.log('重置对话状态');
        passengerSystem.chatSystem.currentDialogue = null;
        passengerSystem.chatSystem.currentDialogueIndex = 0;
        passengerSystem.chatSystem.isChattingActive = false;
        
        // 清空活跃对话者数组
        passengerSystem.chatSystem.activeChatters = [];
        
        // 最后隐藏对话气泡
        hideChatBubble();
        
        console.log('对话状态已重置，chattedSeats集合大小:', passengerSystem.chatSystem.chattedSeats.size);
        console.log('chattedSeats包含的座位ID:', Array.from(passengerSystem.chatSystem.chattedSeats));
        
        // 对话结束后，尝试触发新对话
        setTimeout(() => {
            tryTriggerConversation();
        }, 500); // 稍微延迟一下，让上一个对话完全结束
    }
}

// 更新乘客和路人系统
function updatePassengerSystem(deltaTime) {
    // 创建初始的UI元素
    if (!passengerSystem.passengerCountElement) {
        createPassengerNotification();
    }
    
    // 创建对话气泡
    if (!passengerSystem.chatSystem.chatBubbleElement) {
        createChatBubble();
    }
    
    // 确保座位系统已初始化
    if (!seatSystem.initialized) {
        seatSystem.initializeSeats();
        seatSystem.initialized = true;
    }
    
    // 更新到站乘客数量显示
    if (passengerSystem.passengerCountElement) {
        passengerSystem.passengerCountElement.innerHTML = `到站人数: ${passengerSystem.arrivedCount}`;
    }
    
    // 只更新当前对话状态，不再尝试随机触发新对话
    if (passengerSystem.chatSystem.isChattingActive) {
        passengerSystem.chatSystem.chatTimer += deltaTime;
        
        // 如果当前句子对话时间结束，显示下一句或结束对话
        if (passengerSystem.chatSystem.chatTimer >= passengerSystem.chatSystem.chatDuration) {
            showCurrentDialogueMessage();
        }
        
        // 对话超时检测 - 防止对话系统永久锁定
        // 如果一句对话显示时间超过了正常显示时间的3倍，则强制结束对话
        if (passengerSystem.chatSystem.chatTimer > passengerSystem.chatSystem.chatDuration * 3) {
            console.warn('对话超时，强制结束当前对话');
            // 立即结束对话，释放可能被锁定的乘客
            if (passengerSystem.chatSystem.currentDialogue) {
                passengerSystem.chatSystem.currentDialogueIndex = passengerSystem.chatSystem.currentDialogue.length;
                showCurrentDialogueMessage(); // 这将触发对话结束流程
            } else {
                // 如果对话内容为空，直接重置对话状态
                passengerSystem.chatSystem.isChattingActive = false;
                passengerSystem.chatSystem.activeChatters = [];
                hideChatBubble();
            }
        }
    }
    
    // 更新巴士运动时间计数
    if (busAnimation.isMoving && busAnimation.currentSpeedFactor > 0.5) {
        passengerSystem.movingTime += deltaTime;
        
        // 为每个在车上的乘客更新计时器
        passengerSystem.passengers.forEach(passenger => {
            if (passenger.remainingTime > 0) {
                passenger.remainingTime -= deltaTime;
                
                // 如果计时器归零，增加等待下车的乘客数量
                if (passenger.remainingTime <= 0 && !passenger.isWaiting) {
                    // 检查该乘客是否正在对话中
                    const seatId = passenger.seatId;
                    const isChattingNow = passengerSystem.chatSystem.isChattingActive && 
                                         passengerSystem.chatSystem.activeChatters.some(seat => seat.id === seatId);
                    
                    // 把乘客标记为等待下车
                    passenger.isWaiting = true;
                    passenger.waitingCountUpdated = false; // 初始化为未更新计数状态
                    
                    // 只有不在对话中的乘客才会立即触发下车提示
                    if (!isChattingNow) {
                        passengerSystem.waitingCount++;
                        passenger.waitingCountUpdated = true; // 设为已经更新计数
                        
                        // 显示下车提示
                        showPassengerNotification();
                    } else {
                        console.log(`乘客在座位 ${seatId} 到站了，但正在对话，将在对话完成后下车`);
                    }
                }
            }
        });
        
        // 只有当巴士持续运动超过10秒后，才开始生成路人
        if (passengerSystem.movingTime >= 10) {
            // 检查是否需要生成新的路人
            passengerSystem.pedestrianSpawnTimer += deltaTime;
            if (passengerSystem.pedestrianSpawnTimer >= passengerSystem.pedestrianSpawnInterval && window.createPedestrian) {
                spawnPedestrians();
                passengerSystem.pedestrianSpawnTimer = 0;
            }
        }
    } else {
        // 如果巴士停止，重置连续运动时间计数
        if (!busAnimation.isMoving && busAnimation.currentSpeedFactor < 0.01) {
            passengerSystem.movingTime = 0;
        }
    }
    
    // 检查是否有对话已结束的乘客需要下车
    if (!passengerSystem.chatSystem.isChattingActive) {
        // 检查是否有等待下车但因为在对话中而被延迟的乘客
        const delayedPassengers = passengerSystem.passengers.filter(p => 
            p.isWaiting && !p.waitingCountUpdated);
        
        if (delayedPassengers.length > 0) {
            console.log(`${delayedPassengers.length} 个对话结束的乘客可以下车了`);
            passengerSystem.waitingCount += delayedPassengers.length;
            
            // 标记这些乘客已更新等待计数，避免重复计数
            delayedPassengers.forEach(p => {
                p.waitingCountUpdated = true;
            });
            
            showPassengerNotification();
        }
    }
    
    // 如果巴士停止，处理乘客下车
    if (!busAnimation.isMoving && busAnimation.currentSpeedFactor < 0.01 && passengerSystem.waitingCount > 0) {
        // 筛选出等待下车的乘客，但跳过正在对话中的乘客
        const leavingPassengers = passengerSystem.passengers.filter(p => {
            if (!p.isWaiting) return false;
            
            // 检查乘客是否正在对话
            const seatId = p.seatId;
            const isChattingNow = passengerSystem.chatSystem.isChattingActive && 
                                 passengerSystem.chatSystem.activeChatters.some(seat => seat.id === seatId);
            
            // 如果正在对话，暂时不让其下车，但保留下车状态
            if (isChattingNow) {
                console.log(`乘客在座位 ${seatId} 正在对话中，暂时不下车`);
                return false;
            }
            
            return true;
        });
        
        // 处理乘客下车
        if (leavingPassengers.length > 0) {
            console.log(`${leavingPassengers.length} 个乘客下车`);
            
            // 增加已下车乘客计数
            passengerSystem.arrivedCount += leavingPassengers.length;
            
            // 在巴士位置创建下车的路人
            if (window.createPedestrian) {
                leavingPassengers.forEach((passenger, index) => {
                    // 在巴士位置创建路人，并设置为不会上车
                    window.createPedestrian(bus.position.x + index * 0.5, false);
                    
                    // 释放座位
                    if (passenger.seatId) {
                        // 释放座位（freeSeat函数内部会调用releaseSeatFromChat）
                        seatSystem.freeSeat(passenger.seatId);
                    }
                });
            }
            
            // 移除下车的乘客
            passengerSystem.passengers = passengerSystem.passengers.filter(p => !p.isWaiting);
            
            // 重置等待计数
            passengerSystem.waitingCount = 0;
            
            // 隐藏下车提示
            hidePassengerNotification();
        } else if (passengerSystem.waitingCount > 0) {
            // 虽然有乘客等待下车，但他们都在对话中
            console.log(`有 ${passengerSystem.waitingCount} 个乘客等待下车，但所有等待下车的乘客都在对话中`);
        }
    }
    
    // 检查是否存在计数错误导致乘客无法下车的情况
    if (!busAnimation.isMoving && busAnimation.currentSpeedFactor < 0.01 && passengerSystem.waitingCount === 0) {
        // 检查是否有标记为等待下车但没被计入waitingCount的乘客
        const stuckPassengers = passengerSystem.passengers.filter(p => 
            p.isWaiting && (!passengerSystem.chatSystem.isChattingActive || 
            (p.seatId && !passengerSystem.chatSystem.activeChatters.some(seat => seat.id === p.seatId))));
        
        if (stuckPassengers.length > 0) {
            console.log(`发现计数问题：有${stuckPassengers.length}个乘客等待下车，但waitingCount为0，现在修正`);
            passengerSystem.waitingCount = stuckPassengers.length;
            
            // 确保所有等待下车的乘客都被正确标记为已更新计数
            stuckPassengers.forEach(p => {
                p.waitingCountUpdated = true;
            });
            
            showPassengerNotification();
        }
        
        // 检查剩余时间为负但未标记为等待下车的乘客
        const expiredPassengers = passengerSystem.passengers.filter(p => 
            p.remainingTime <= 0 && !p.isWaiting);
            
        if (expiredPassengers.length > 0) {
            console.log(`发现${expiredPassengers.length}个剩余时间为负但未标记为等待下车的乘客，现在修正`);
            expiredPassengers.forEach(p => {
                p.isWaiting = true;
                p.waitingCountUpdated = true;
            });
            passengerSystem.waitingCount += expiredPassengers.length;
            showPassengerNotification();
        }
    }
    
    // 更新路人位置和行为
    updatePedestrians(deltaTime);
}

// 显示对话历史
function showChatHistory() {
    // 创建历史记录容器
    const historyContainer = document.createElement('div');
    historyContainer.id = 'chat-history-container';
    historyContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(255, 255, 255, 0.95);
        padding: 20px;
        border-radius: 15px;
        width: 80%;
        max-width: 600px;
        height: 80vh;
        z-index: 2000;
        box-shadow: 0 0 20px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
    `;
    
    // 创建标题
    const title = document.createElement('h2');
    title.innerHTML = `田园轶闻`;
    title.style.cssText = `
        text-align: center;
        margin-bottom: 10px;
        color: #333;
    `;
    historyContainer.appendChild(title);
    
    // 动态获取对话总数量
    const totalConversations = getConversationsCount();
    const usedCount = passengerSystem.usedConversations.size;
    const remainingCount = totalConversations - usedCount;
    
    // 添加未触发对话数量信息
    const remainingConversations = document.createElement('p');
    remainingConversations.innerHTML = ` ${totalConversations - remainingCount}/${totalConversations}`;
    remainingConversations.style.cssText = `
        text-align: center;
        margin-bottom: 20px;
        color: #777;
        font-size: 14px;
        font-style: italic;
    `;
    historyContainer.appendChild(remainingConversations);
    
    // 检查是否收集了全部轶闻
    const allCollected = passengerSystem.chatHistory.length >= totalConversations;
    
    // 创建对话历史的滚动容器
    const scrollContainer = document.createElement('div');
    scrollContainer.style.cssText = `
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        margin-bottom: 15px;
    `;
    historyContainer.appendChild(scrollContainer);
    
    // 根据是否有对话历史显示相应内容
    if (passengerSystem.chatHistory.length > 0) {
        // 创建所有对话的容器
        const allConversationsContainer = document.createElement('div');
        allConversationsContainer.style.cssText = `
            padding: 0 10px;
        `;
        
        // 遍历每个对话并创建对应的UI元素
        passengerSystem.chatHistory.forEach((conversation, index) => {
            // 只获取一句话纪事摘要，不再使用标题
            const summary = generateConversationSummary(conversation);
            
            // 创建轶事内容容器
            const conversationDiv = document.createElement('div');
            conversationDiv.style.cssText = `
                margin-bottom: 15px;
                padding: 12px;
                background-color: #fff;
                border-radius: 8px;
                border-left: 4px solid #3498db;
            `;
            
            // 显示一句话纪事
            const conversationSummary = document.createElement('p');
            conversationSummary.innerHTML = summary;
            conversationSummary.style.cssText = `
                margin: 0;
                color: #555;
            `;
            conversationDiv.appendChild(conversationSummary);
            
            // 添加这个对话到所有对话的容器中
            allConversationsContainer.appendChild(conversationDiv);
            
            // 如果不是最后一个对话，添加分隔线
            if (index < passengerSystem.chatHistory.length - 1) {
                const divider = document.createElement('hr');
                divider.style.cssText = `
                    border: none;
                    border-top: 1px dashed #ddd;
                    margin: 15px 0;
                `;
                allConversationsContainer.appendChild(divider);
            }
        });
        
        // 将所有对话的容器添加到滚动区域
        scrollContainer.appendChild(allConversationsContainer);
    }
    
    // 创建底部按钮容器（放在滚动区域外）
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: center;
    `;
    
    // 创建关闭按钮
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '关闭';
    closeButton.style.cssText = `
        padding: 8px 25px;
        background-color: #3498db;
        color: white;
        border: none;
        border-radius: 20px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    closeButton.addEventListener('mouseover', () => {
        closeButton.style.backgroundColor = '#2980b9';
        closeButton.style.transform = 'scale(1.05)';
    });
    
    closeButton.addEventListener('mouseout', () => {
        closeButton.style.backgroundColor = '#3498db';
        closeButton.style.transform = 'scale(1)';
    });
    
    // 添加点击事件
    closeButton.addEventListener('click', () => {
        document.body.removeChild(historyContainer);
        
        // 如果收集了全部轶闻且未显示过恭喜弹窗，则显示恭喜弹窗
        if (allCollected && !passengerSystem.allCollectedMessageShown) {
            showAllCollectedMessage();
        }
    });
    
    buttonContainer.appendChild(closeButton);
    historyContainer.appendChild(buttonContainer);
    
    // 将容器添加到页面
    document.body.appendChild(historyContainer);
    
    // 如果收集了全部轶闻且未显示过恭喜弹窗，标记将要显示恭喜弹窗
    if (allCollected && !passengerSystem.allCollectedMessageShown) {
        passengerSystem.allCollectedMessageShown = true;
    }
}

// 显示收集全部轶闻的恭喜弹窗
function showAllCollectedMessage() {
    // 创建弹窗容器
    const messageContainer = document.createElement('div');
    messageContainer.id = 'all-collected-message';
    messageContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(255, 255, 255, 0.98);
        padding: 30px;
        border-radius: 15px;
        width: 80%;
        max-width: 500px;
        z-index: 3000;
        box-shadow: 0 0 30px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    `;
    
    // 创建标题
    const title = document.createElement('h2');
    title.innerHTML = `恭喜通关！`;
    title.style.cssText = `
        margin-bottom: 20px;
        color: #27ae60;
        font-size: 28px;
    `;
    messageContainer.appendChild(title);
    
    // 创建内容
    const content = document.createElement('p');
    content.innerHTML = `您已收集到全部30条田园轶闻！<br>接下来请尽情享受田园风光。<br>感谢您的游玩！`;
    content.style.cssText = `
        margin-bottom: 30px;
        color: #555;
        font-size: 16px;
        line-height: 1.6;
    `;
    messageContainer.appendChild(content);
    
    // 创建按钮容器
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        display: flex;
        justify-content: space-around;
        width: 100%;
    `;
    
    // 创建继续游玩按钮
    const continueButton = document.createElement('button');
    continueButton.innerHTML = '继续游玩';
    continueButton.style.cssText = `
        padding: 10px 25px;
        background-color: #3498db;
        color: white;
        border: none;
        border-radius: 20px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    continueButton.addEventListener('mouseover', () => {
        continueButton.style.backgroundColor = '#2980b9';
        continueButton.style.transform = 'scale(1.05)';
    });
    
    continueButton.addEventListener('mouseout', () => {
        continueButton.style.backgroundColor = '#3498db';
        continueButton.style.transform = 'scale(1)';
    });
    
    // 添加继续游玩点击事件
    continueButton.addEventListener('click', () => {
        document.body.removeChild(messageContainer);
    });
    
    // 创建重新开始按钮
    const restartButton = document.createElement('button');
    restartButton.innerHTML = '重新开始';
    restartButton.style.cssText = `
        padding: 10px 25px;
        background-color: #27ae60;
        color: white;
        border: none;
        border-radius: 20px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    restartButton.addEventListener('mouseover', () => {
        restartButton.style.backgroundColor = '#219d55';
        restartButton.style.transform = 'scale(1.05)';
    });
    
    restartButton.addEventListener('mouseout', () => {
        restartButton.style.backgroundColor = '#27ae60';
        restartButton.style.transform = 'scale(1)';
    });
    
    // 添加重新开始点击事件
    restartButton.addEventListener('click', () => {
        // 重置游戏状态
        resetGame();
        // 关闭弹窗
        document.body.removeChild(messageContainer);
    });
    
    // 添加按钮到按钮容器
    buttonsContainer.appendChild(continueButton);
    buttonsContainer.appendChild(restartButton);
    
    // 添加按钮容器到主容器
    messageContainer.appendChild(buttonsContainer);
    
    // 将容器添加到页面
    document.body.appendChild(messageContainer);
}

// 重置游戏状态
function resetGame() {
    // 清空对话历史
    passengerSystem.chatHistory = [];
    
    // 清空已使用对话记录
    passengerSystem.usedConversations.clear();
    
    // 重置对话系统状态
    passengerSystem.chatSystem.chattedSeats.clear();
    passengerSystem.chatSystem.isChattingActive = false;
    passengerSystem.chatSystem.currentDialogue = null;
    passengerSystem.chatSystem.currentDialogueIndex = 0;
    passengerSystem.chatSystem.activeChatters = [];
    
    // 重置全部轶闻收集标记
    passengerSystem.allCollectedMessageShown = false;
    
    // 重置到站人数
    passengerSystem.arrivedCount = 0;
    if (passengerSystem.passengerCountElement) {
        passengerSystem.passengerCountElement.innerHTML = `到站人数: 0`;
    }
    
    // 更新轶闻按钮文本
    const storyButton = document.getElementById('passenger-story-btn');
    if (storyButton) {
        storyButton.innerHTML = `田园轶闻: 0`;
    }
    
    // 清空现有乘客
    passengerSystem.passengers.forEach(passenger => {
        if (passenger.seatId) {
            seatSystem.freeSeat(passenger.seatId);
        }
    });
    passengerSystem.passengers = [];
    
    // 添加新的随机乘客
    initializeRandomPassengers(6);
    
    console.log('游戏已重置，所有轶闻记录和状态已清空');
}

// 根据对话内容生成概括性标题
function generateConversationTitle(conversation) {
    // 根据对话内容确定主题
    const fullText = conversation.join(' ');
    
    // 根据对话内容关键词生成更具诗意的标题
    if (fullText.includes('麦子') || fullText.includes('收成') || fullText.includes('雨水')) {
        return "滋养花朵的雨";
    } else if (fullText.includes('打工') || fullText.includes('工厂')) {
        return "飞向天外的鸟";
    } else if (fullText.includes('上学') || fullText.includes('学校')) {
        return "知识的种子";
    } else if (fullText.includes('村东头') || fullText.includes('桥')) {
        return "通向远方的桥";
    } else if (fullText.includes('定亲') || fullText.includes('闺女')) {
        return "人生的新篇章";
    } else if (fullText.includes('孙子') || fullText.includes('成绩')) {
        return "无拘无束的童年";
    } else if (fullText.includes('感冒')) {
        return "温暖的关怀";
    } else if (fullText.includes('猪') || fullText.includes('菜园')) {
        return "小小的意外";
    } else if (fullText.includes('赶集')) {
        return "热闹的集市";
    } else if (fullText.includes('孩子') || fullText.includes('淘气')) {
        return "童年的烦恼";
    } else if (fullText.includes('地里') || fullText.includes('玉米')) {
        return "辛勤的汗水";
    } else if (fullText.includes('腿摔了')) {
        return "守望相助";
    } else if (fullText.includes('电影')) {
        return "流动的光影";
    } else if (fullText.includes('牛')) {
        return "田野的朋友";
    } else if (fullText.includes('箩筐') || fullText.includes('编')) {
        return "巧手编织的情";
    } else if (fullText.includes('院子') || fullText.includes('菜')) {
        return "绿油油的希望";
    } else if (fullText.includes('二宝') || fullText.includes('满月')) {
        return "新生命的礼赞";
    } else if (fullText.includes('补鞋')) {
        return "老手艺的传承";
    } else if (fullText.includes('钓鱼')) {
        return "安静的水面";
    } else if (fullText.includes('自行车')) {
        return "铁马的旅途";
    } else if (fullText.includes('油菜花')) {
        return "金色的田野";
    } else if (fullText.includes('书包')) {
        return "知识的行囊";
    } else if (fullText.includes('鸡鸭') || fullText.includes('黄鼠狼')) {
        return "院子里的小战争";
    } else if (fullText.includes('秧苗')) {
        return "希望的田野";
    } else if (fullText.includes('纳凉')) {
        return "夏夜的歌谣";
    } else if (fullText.includes('柴火')) {
        return "温暖的灶台";
    } else if (fullText.includes('电灯') || fullText.includes('煤油灯')) {
        return "时光的更迭";
    } else if (fullText.includes('裁衣服')) {
        return "针线间的智慧";
    } else if (fullText.includes('广播操')) {
        return "晨曦中的旋律";
    } else if (fullText.includes('月饼') || fullText.includes('中秋')) {
        return "圆月下的团圆";
    } else {
        return "乡间的絮语";
    }
}

// 根据对话内容生成一句话纪事
function generateConversationSummary(conversation) {
    // 提取对话主要内容并概括成一句话
    const content = summarizeContent(conversation);
    return content;
}

// 从对话中提取说话者
function extractSpeakers(conversation) {
    const speakers = [];
    
    conversation.forEach(line => {
        // 分离说话者和对话内容
        const colonIndex = line.indexOf('：');
        if (colonIndex > 0) {
            const speaker = line.substring(0, colonIndex);
            if (!speakers.includes(speaker)) {
                speakers.push(speaker);
            }
        }
    });
    
    return speakers;
}

// 确定对话主题
function determineConversationTopic(conversation) {
    // 根据对话内容中的关键词确定主题
    const fullText = conversation.join(' ');
    
    if (fullText.includes('麦子') || fullText.includes('庄稼') || fullText.includes('收成') || fullText.includes('田') || fullText.includes('地')) {
        return '农事交流';
    } else if (fullText.includes('学') || fullText.includes('成绩') || fullText.includes('读书') || fullText.includes('书包')) {
        return '教育话题';
    } else if (fullText.includes('孩子') || fullText.includes('娃') || fullText.includes('家') || fullText.includes('爸') || fullText.includes('妈')) {
        return '家庭闲谈';
    } else if (fullText.includes('城里') || fullText.includes('镇上') || fullText.includes('进城')) {
        return '城乡见闻';
    } else if (fullText.includes('电影') || fullText.includes('广播') || fullText.includes('纳凉')) {
        return '文娱话题';
    } else if (fullText.includes('手艺') || fullText.includes('缝') || fullText.includes('补')) {
        return '手艺分享';
    } else if (fullText.includes('病') || fullText.includes('感冒') || fullText.includes('身体')) {
        return '健康关怀';
    } else if (fullText.includes('鸡') || fullText.includes('鸭') || fullText.includes('猪') || fullText.includes('牛')) {
        return '牲畜讨论';
    } else if (fullText.includes('风景') || fullText.includes('花') || fullText.includes('景色')) {
        return '景色欣赏';
    } else if (fullText.includes('菜') || fullText.includes('吃') || fullText.includes('饭') || fullText.includes('包子')) {
        return '饮食交流';
    } else {
        return '温馨对话';
    }
}

// 概括对话内容
function summarizeContent(conversation) {
    // 根据关键词和对话内容生成概括性描述
    const fullText = conversation.join(' ');
    
    if (fullText.includes('麦子') || fullText.includes('收成')) {
        return "最近雨水充足，村民们很开心，觉得今年孩子的学费有着落了。";
    } else if (fullText.includes('打工') || fullText.includes('工厂')) {
        return "年轻人进城打工，长辈叮嘱他身体健康比金钱更重要。";
    } else if (fullText.includes('上学') || fullText.includes('学校')) {
        return "上学路上的小姑娘，得到了老人家递来的热饼和关心。";
    } else if (fullText.includes('村东头') || fullText.includes('桥')) {
        return "村里即将修建新桥，村民们期待着往返镇上会更加方便。";
    } else if (fullText.includes('定亲') || fullText.includes('闺女')) {
        return "闺女定亲的喜事传开，邻里间相约共庆红白喜事。";
    } else if (fullText.includes('孙子') || fullText.includes('成绩')) {
        return "老人对孙子教育有独特见解，认为品德比成绩更重要。";
    } else if (fullText.includes('感冒')) {
        return "小姑娘的感冒好转了，长辈们还不忘叮嘱要多注意保暖。";
    } else if (fullText.includes('猪') || fullText.includes('菜园')) {
        return "家里的猪闯进了村长菜园，引出了邻里间的笑话和互助承诺。";
    } else if (fullText.includes('赶集')) {
        return "集市日的盼头，不仅是物品交换，更是生活乐趣的寄托。";
    } else if (fullText.includes('孩子') || fullText.includes('淘气')) {
        return "表面懂事的孩子家中淘气，妈妈们交流着育儿的喜忧参半。";
    } else if (fullText.includes('地里') || fullText.includes('玉米')) {
        return "地里的农活即将收尾，劳作的辛苦后有热包子的慰藉。";
    } else if (fullText.includes('腿摔了')) {
        return "一人摔伤了腿，感受到了邻里胜似亲人的关怀和帮助。";
    } else if (fullText.includes('电影')) {
        return "村里即将放映的电影，勾起了人们对经典老片的热切期待。";
    } else if (fullText.includes('牛')) {
        return "新买的牛虽然吃得多，但寄托着来年春耕的希望。";
    } else if (fullText.includes('箩筐') || fullText.includes('赶集卖')) {
        return "手工编织的箩筐既是谋生工具，也是邻里间传递情谊的媒介。";
    } else if (fullText.includes('院子') && fullText.includes('菜')) {
        return "院子里青翠的菜园，承载着勤劳和分享的乡村美德。";
    } else if (fullText.includes('二宝') || fullText.includes('满月')) {
        return "孩子满月的喜事，让亲朋无法到场的遗憾中也含着真诚的祝福。";
    } else if (fullText.includes('补鞋')) {
        return "诚实做事的补鞋匠，凭手艺和信誉在镇上赢得了口碑。";
    } else if (fullText.includes('钓鱼')) {
        return "半天只钓到一条被猫叼走的小鱼，成了两人交谈中的笑料。";
    } else if (fullText.includes('自行车')) {
        return "二手自行车经过修整焕发新生，展现了年轻人的巧手和智慧。";
    } else if (fullText.includes('油菜花')) {
        return "路边盛开的油菜花勾起乡愁，城里来的客人都不忍离去。";
    } else if (fullText.includes('书包')) {
        return "旧衣服做成的新书包，蕴含着母亲的爱和乡邻的关怀。";
    } else if (fullText.includes('鸡鸭') || fullText.includes('黄鼠狼')) {
        return "养鸡鸭的辛苦不在照料，而在与黄鼠狼的机智周旋。";
    } else if (fullText.includes('秧苗')) {
        return "阳光下的秧苗生机勃勃，预示着秋天丰收的喜悦和热闹。";
    } else if (fullText.includes('纳凉')) {
        return "村头纳凉处的老人闲谈和孩童嬉戏，编织成夏夜最美的风景。";
    } else if (fullText.includes('柴火')) {
        return "邻里间的柴火互助，如同燃起的不只是炉灶，还有人情温暖。";
    } else if (fullText.includes('电灯') || fullText.includes('煤油灯')) {
        return "从煤油灯到电灯的变迁，见证着时代发展和人心不变的温暖。";
    } else if (fullText.includes('裁衣服')) {
        return "裁衣手艺的传授，是年长者给年轻人最实用的生活赠礼。";
    } else if (fullText.includes('广播操')) {
        return "清晨广播操的声音唤醒村庄，凝聚起村民们的精神和活力。";
    } else if (fullText.includes('月饼') || fullText.includes('中秋')) {
        return "手工月饼的香气弥漫村庄，预约的热情印证着乡邻间的情谊。";
    } else {
        return "公交车上的闲谈，刻画出乡村生活中最朴实的人情味。";
    }
}

// 初始化随机乘客
function initializeRandomPassengers(count = 6) {
    console.log(`初始化${count}名随机乘客`);
    
    // 已添加的乘客数量
    let addedCount = 0;
    
    // 尝试添加指定数量的乘客
    while (addedCount < count) {
        // 检查是否有空座位
        const emptySeat = seatSystem.getRandomEmptySeat();
        if (emptySeat) {
            // 创建新乘客对象
            const travelTime = 30 + Math.floor(Math.random() * 31); // 30-60秒的随机行程时间
            const passenger = {
                remainingTime: travelTime,
                originalTime: travelTime,
                seatId: emptySeat.id
            };
            
            // 将乘客添加到系统并占用座位
            passengerSystem.passengers.push(passenger);
            seatSystem.occupySeat(emptySeat.id, passenger);
            
            console.log('已添加初始乘客到座位：', emptySeat.id);
            addedCount++;
        } else {
            // 如果没有更多空座位，提前结束
            console.log('没有更多空座位，已添加', addedCount, '名乘客');
            break;
        }
    }
    
    console.log(`成功初始化了${addedCount}名随机乘客`);
}

// 释放座位并移除对话状态
function releaseSeatFromChat(seatId) {
    if (passengerSystem.chatSystem.chattedSeats.has(seatId)) {
        console.log(`释放座位 ${seatId} 的对话状态`);
        passengerSystem.chatSystem.chattedSeats.delete(seatId);
        
        // 更新测试对话按钮文本
        updateTestChatButtonText();
    }
}