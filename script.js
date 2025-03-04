document.getElementById('fileInput').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const yamlContent = e.target.result;
            try {
                const data = jsyaml.load(yamlContent); // 解析 YAML
                const treeData = buildTreeFromYAML(data); // 构建树状结构
                renderTree(treeData); // 生成树状图
            } catch (error) {
                alert('Invalid YAML file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
});

// 构建树状结构
function buildTreeFromYAML(data) {
    const root = {
        name: 'Root',
        children: []
    };
    if (data.flows) {
        for (const flowKey in data.flows) {
            const flow = data.flows[flowKey];
            const flowNode = {
                name: flow.name,
                description: flow.description,
                children: []
            };

            // 从第一个 collect 开始
            if (flow.steps && flow.steps.length > 0) {
                const firstStep = flow.steps[0];
                const firstStepNode = buildStepNode(firstStep, flow.steps);
                flowNode.children.push(firstStepNode);
            }

            root.children.push(flowNode);
        }
    }

    return root;
}

// 构建下一个节点
function buildNextNode(nextStep, allSteps) {
    // Check if nextStep is END, which should correspond with an action
    if (nextStep === 'END') {
        return {
            name: 'END',  // We label this node as 'END'
            children: []   // No children because it's the end of the flow
        };
    }

    // 如果 nextStep 是一个对象（例如包含 action 和 next）
    if (typeof nextStep === 'object' && nextStep[0].action) {
        const actionNode = {
            name: `action: ${nextStep[0].action}`,  // Label the action node
            children: []  // Initialize with no children
        };

        // Handle next step after the action (if exists)
        if (nextStep[0].next) {
            const nextNode = buildNextNode(nextStep[0].next, allSteps);
            if (nextNode) {
                actionNode.children.push(nextNode);  // Add the next step as a child
            }
        }

        return actionNode;  // Return the action node
    }

    // 如果 nextStep 是一个字符串（例如跳转到下一个 collect 节点）
    if (typeof nextStep === 'string') {
        const nextCollectStep = allSteps.find(step => step.collect === nextStep);
        if (nextCollectStep) {
            return buildStepNode(nextCollectStep, allSteps);  // Return the step node
        }
    }

    return null;  // Return null if no valid nextStep is found
}

// 构建步骤节点
function buildStepNode(step, allSteps) {
    const stepNode = {
        name: step.collect,
        description: step.description,
        children: []
    };

    if (step.next) {
        step.next.forEach(nextStep => {
            if (nextStep.if) {
                const ifNode = {
                    name: `if: ${nextStep.if}`,
                    children: []
                };

                if (nextStep.then) {
                    const thenNode = buildNextNode(nextStep.then, allSteps);
                    if (thenNode) {
                        ifNode.children.push(thenNode);
                    }
                }

                stepNode.children.push(ifNode);
            } else if (nextStep.else) {
                const elseNode = {
                    name: 'else',
                    children: []
                };

                const nextNode = buildNextNode(nextStep.else, allSteps);
                if (nextNode) {
                    elseNode.children.push(nextNode);
                }

                stepNode.children.push(elseNode);
            }
        });
    }

    return stepNode;
}

// 添加缩放控制
let currentZoom = d3.zoomIdentity;

function setupZoomControls(svg) {
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            currentZoom = event.transform;
            svg.attr('transform', event.transform);
        });

    d3.select('#zoomIn').on('click', () => {
        zoom.scaleBy(svg.transition().duration(300), 1.2);
    });

    d3.select('#zoomOut').on('click', () => {
        zoom.scaleBy(svg.transition().duration(300), 0.8);
    });

    d3.select('#zoomReset').on('click', () => {
        svg.transition().duration(300)
            .call(zoom.transform, d3.zoomIdentity);
    });

    return zoom;
}

// 添加搜索功能
function setupSearch(nodes) {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        nodes.each(function(d) {
            const node = d3.select(this);
            const text = (d.data.name + (d.data.description || '')).toLowerCase();
            const matches = text.includes(searchTerm);
            node.style('opacity', matches || !searchTerm ? 1 : 0.3);
        });
    });
}

// 添加节点折叠/展开功能
function toggleNode(d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    update(d);
}

// 添加工具提示
function addTooltip(node) {
    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

    node.on('mouseover', function(event, d) {
        tooltip.transition()
            .duration(200)
            .style('opacity', .9);
        tooltip.html(`
            <strong>${d.data.name}</strong><br/>
            ${d.data.description || ''}
        `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', function() {
        tooltip.transition()
            .duration(500)
            .style('opacity', 0);
    });
}

// 使用 D3.js 渲染树状图
function renderTree(data) {
    // 清空现有内容
    const treeDiagram = d3.select('#treeDiagram');
    treeDiagram.html('');

    // 设置尺寸
    const margin = {top: 20, right: 90, bottom: 30, left: 90};
    const width = 2000;
    const height = 800;

    // 创建SVG
    const svg = treeDiagram.append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background', 'white');

    // 创建主要的g元素
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // 创建树布局
    const tree = d3.tree()
        .size([height - margin.top - margin.bottom, width - margin.left - margin.right]);

    // 创建层级数据
    const root = d3.hierarchy(data);
    
    // 计算树布局
    tree(root);

    // 创建工具提示
    const tooltip = d3.select('body').append('div')
        .attr('class', 'node-tooltip')
        .style('opacity', 0);

    // 绘制连接线
    g.selectAll('.link')
        .data(root.links())
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x));

    // 创建节点组
    const node = g.selectAll('.node')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.y},${d.x})`);

    // 添加节点圆点
    node.append('circle')
        .attr('class', 'node-dot')
        .attr('r', 5)
        .on('mouseover', function(event, d) {
            // 显示工具提示
            tooltip.transition()
                .duration(200)
                .style('opacity', 1);
            
            // 设置工具提示内容
            let tooltipContent = `<strong>${d.data.name || 'Unnamed'}</strong>`;
            if (d.data.description) {
                tooltipContent += `<br/>${d.data.description}`;
            }
            if (d.data.text) {
                tooltipContent += `<br/><br/>${d.data.text}`;
            }
            
            tooltip.html(tooltipContent)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });

    // 添加缩放功能
    const zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoom);

    // 初始缩放以适应屏幕
    const initialScale = 0.75;
    svg.call(zoom.transform, d3.zoomIdentity
        .translate(margin.left, margin.top)
        .scale(initialScale));
}


// 添加缩放按钮事件处理
if (document.getElementById('zoomIn')) {
    document.getElementById('zoomIn').addEventListener('click', () => {
        const svg = d3.select('#treeDiagram svg');
        const zoom = d3.zoom().on('zoom', (event) => {
            svg.select('g').attr('transform', event.transform);
        });
        svg.transition().call(zoom.scaleBy, 1.2);
    });
}

if (document.getElementById('zoomOut')) {
    document.getElementById('zoomOut').addEventListener('click', () => {
        const svg = d3.select('#treeDiagram svg');
        const zoom = d3.zoom().on('zoom', (event) => {
            svg.select('g').attr('transform', event.transform);
        });
        svg.transition().call(zoom.scaleBy, 0.8);
    });
}

if (document.getElementById('zoomReset')) {
    document.getElementById('zoomReset').addEventListener('click', () => {
        const svg = d3.select('#treeDiagram svg');
        const zoom = d3.zoom().on('zoom', (event) => {
            svg.select('g').attr('transform', event.transform);
        });
        svg.transition().call(zoom.transform, d3.zoomIdentity.translate(90, 20).scale(0.75));
    });
}

// 格式化工具提示内容
function formatTooltipContent(data) {
    let content = `<div class="tooltip-title">${data.name || 'Unnamed Node'}</div>`;
    content += '<div class="tooltip-content">';
    
    // 添加描述信息
    if (data.description) {
        content += `<div>${data.description}</div>`;
    }
    
    // 添加其他相关信息
    if (data.main_intent) {
        content += `<div>Intent: ${data.main_intent}</div>`;
    }
    if (data.main_intent_zh) {
        content += `<div>中文意图: ${data.main_intent_zh}</div>`;
    }
    
    content += '</div>';
    return content;
}

// 获取节点类型指示器
function getNodeTypeIndicator(data) {
    // 根据节点类型返回不同的指示符号
    if (data.children && data.children.length > 0) {
        return '●';  // 父节点
    } else {
        return '○';  // 叶节点
    }
}

// 添加缩放控制
function setupZoomControls(svg) {
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            svg.select('g').attr('transform', event.transform);
        });

    svg.call(zoom);

    // 添加缩放按钮事件处理
    d3.select('#zoomIn').on('click', () => {
        zoom.scaleBy(svg.transition().duration(300), 1.2);
    });

    d3.select('#zoomOut').on('click', () => {
        zoom.scaleBy(svg.transition().duration(300), 0.8);
    });

    d3.select('#zoomReset').on('click', () => {
        svg.transition().duration(300)
            .call(zoom.transform, d3.zoomIdentity);
    });
}