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

// 使用 D3.js 渲染树状图
function renderTree(data) {
    const treeDiagram = d3.select('#treeDiagram');
    treeDiagram.html('');

    const width = 2000;
    const height = 800;
    const nodeWidth = 300; // 增加节点宽度
    const nodeHeight = 100; // 增加节点高度

    const root = d3.hierarchy(data);
    const treeLayout = d3.tree()
        .size([height, width - 400]) // 增加左右间距
        .separation((a, b) => (a.parent === b.parent ? 2 : 3)); // 增加节点间的间隔

    treeLayout(root);

    const svg = treeDiagram.append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(d3.zoom().on('zoom', (event) => {
            svg.attr('transform', event.transform);
        }))
        .append('g')
        .attr('transform', 'translate(100, 50)');

    // 绘制连线
    svg.selectAll('.link')
        .data(root.links())
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x)
        );

    // 绘制节点和文字
    const node = svg.selectAll('.node')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.y},${d.x})`);

    // 添加节点背景矩形
    node.append('rect')
        .attr('class', 'node-bg')
        .attr('x', d => d.children ? -nodeWidth : 10)
        .attr('y', -nodeHeight / 2)
        .attr('width', nodeWidth)
        .attr('height', nodeHeight)
        .attr('rx', 5)
        .attr('ry', 5);

    // 添加节点圆点
    node.append('circle')
        .attr('r', 5);

    // 添加文字包装函数
    function wrap(text, width) {
        text.each(function() {
            const text = d3.select(this);
            const words = text.text().split(/\s+/).reverse();
            let word;
            let line = [];
            let lineNumber = 0;
            const lineHeight = 1.1;
            const y = text.attr("y");
            const dy = parseFloat(text.attr("dy"));
            let tspan = text.text(null).append("tspan").attr("x", function(d) { return d.children ? -10 : 10; }).attr("y", y).attr("dy", dy + "em");
            
            while (word = words.pop()) {
                line.push(word);
                tspan.text(line.join(" "));
                if (tspan.node().getComputedTextLength() > width) {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = [word];
                    tspan = text.append("tspan")
                        .attr("x", function(d) { return d.children ? -10 : 10; })
                        .attr("y", y)
                        .attr("dy", ++lineNumber * lineHeight + dy + "em")
                        .text(word);
                }
            }
        });
    }

    // 添加主文本
    node.append('text')
        .attr('dy', '-1.5em')
        .attr('x', d => d.children ? -10 : 10)
        .style('text-anchor', d => d.children ? 'end' : 'start')
        .text(d => d.data.name || d.data.key)
        .call(wrap, nodeWidth - 20);

    // 添加描述文本
    node.append('text')
        .attr('dy', '1em')
        .attr('x', d => d.children ? -10 : 10)
        .style('text-anchor', d => d.children ? 'end' : 'start')
        .style('font-size', '12px')
        .style('fill', '#666')
        .text(d => d.data.description || '')
        .call(wrap, nodeWidth - 20);
}