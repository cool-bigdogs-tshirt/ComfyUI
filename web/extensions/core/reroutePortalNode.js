import { app } from "../../scripts/app.js";

/**
 * @typedef { import("../../types/litegraph.js").INodeInputSlot } INodeInputSlot
 */

// Node that allows you to redirect connections for cleaner graphs

app.registerExtension({
	name: "Comfy.PortalNode",
	registerCustomNodes() {
		/**
		 * @typedef { import("../../types/litegraph.js").LGraphNode } LGraphNode
		 * @type { LGraphNode }
		 */
		class PortalNode {
			setInputs() {
				this.applyOrientation();

				this.inputs = this.inputs?.filter((input, i) => {
					if (input.link === null) {
						return false;
					}

					const link = app.graph.links[input.link];
					const node = app.graph.getNodeById(link.origin_id);
					const inputType = node.outputs[link.origin_slot]?.type ?? null;
					const displayType = inputType || "*";
					const color = LGraphCanvas.link_type_colors[displayType];

					link.color = color;
					input.type = displayType;
					input.name = displayType;

					return true;
				}, this);

				this.addInput("", "*");
			}

			constructor() {
				let name = 'GLOBAL';
				if (name in app.globalLinks) {
					let i = 1;
					while (name in app.globalLinks) {
						name = `GLOBAL_${i++}`
					}
				}

				if (!this.properties) {
					this.properties = {
						globalName: name,
					};
				}

				this.properties.showOutputText = PortalNode.defaultVisibility;
				this.properties.horizontal = false;

				/**
				 * @typedef { import("../../types/litegraph.js").ITextWidget } ITextWidget
				 * @type { import("../../types/litegraph.js").WidgetCallback<ITextWidget> }
				 */
				const nameCallback = function(value, graphCanvas, node, pos, event) {
					// TODO: !!! what if the name already exists...?
					this.value = value;
					node.setSize(node.computeSize());
					console.log(app.globalLinks);
				}
				this.addWidget("text", "name", name, nameCallback, "globalName");

				this.setInputs();

				this.clone = function () {
					const cloned = PortalNode.prototype.clone.apply(this);
					cloned.size = cloned.computeSize();
					return cloned;
				};

				// This node is purely frontend and does not impact the resulting prompt so should not be serialized
				this.isVirtualNode = true;
			}

			// onConfigure(info) {
			// 	this.widgets[0].value = info.globalName ?? 'GLOBAL';
			// }

			onPropertyChanged(key, value) {
				if (key === 'globalName') {
					if (value in app.globalLinks) {
						delete app.globalLinks[value];
					}
					app.globalLinks[value] = this;

					app.graph._nodes.forEach((node) => {
						if (node.type === 'Portal Exit') {
							node.widgets[0].options.values = Object.keys(app.globalLinks);
						}
					}, this);
				}
			}

			onConnectionsChange(type, slotIndex, isConnected, link, ioSlot) {
				this.setInputs();

				app.graph._nodes.forEach((node) => {
					if (node.type === 'Portal Exit' && node.properties?.globalName === this.properties.globalName) {
						node.setOutputs();
					}
				}, this);
			};

			getExtraMenuOptions(_, options) {
				options.unshift(
					{
						content: (this.properties.showOutputText ? "Hide" : "Show") + " Type",
						callback: () => {
							this.properties.showOutputText = !this.properties.showOutputText;
							if (this.properties.showOutputText) {
								this.outputs[0].name = this.__outputType || this.outputs[0].type;
							} else {
								this.outputs[0].name = "";
							}
							this.size = this.computeSize();
							this.applyOrientation();
							app.graph.setDirtyCanvas(true, true);
						},
					},
					{
						content: (PortalNode.defaultVisibility ? "Hide" : "Show") + " Type By Default",
						callback: () => {
							PortalNode.setDefaultTextVisibility(!PortalNode.defaultVisibility);
						},
					},
					{
						// naming is inverted with respect to LiteGraphNode.horizontal
						// LiteGraphNode.horizontal == true means that 
						// each slot in the inputs and outputs are layed out horizontally, 
						// which is the opposite of the visual orientation of the inputs and outputs as a node
						content: "Set " + (this.properties.horizontal ? "Horizontal" : "Vertical"),
						callback: () => {
							this.properties.horizontal = !this.properties.horizontal;
							this.applyOrientation();
						},
					}
				);
			}

			applyOrientation() {
				this.horizontal = this.properties.horizontal;
				this.inputs?.forEach((input, i) => {
					if (this.horizontal) {
						// we correct the input position, because LiteGraphNode.horizontal 
						// doesn't account for title presence
						// which reroute nodes don't have
						input.pos = [(this.size[0] * i) / (this.inputs.length + 1), 0];
					} else {
						delete input.pos;
					}
				});
				app.graph.setDirtyCanvas(true, true);
			}

			computeSize() {
				return [
					this.inputs && this.inputs.length && this.properties.globalName
						? Math.max(75, LiteGraph.NODE_TEXT_SIZE * (`  ${this.name}  ${this.properties.globalName}  `.length) * 0.5 + 40)
						: 75,
					26 * ((this.inputs ?? []).length + 1),
				];
			}

			onRemoved() {
				delete app.globalLinks[this.properties.globalName];
			}

			static setDefaultTextVisibility(visible) {
				PortalNode.defaultVisibility = visible;
				if (visible) {
					localStorage["Comfy.PortalNode.DefaultVisibility"] = "true";
				} else {
					delete localStorage["Comfy.PortalNode.DefaultVisibility"];
				}
			}
		}

		// Load default visibility
		PortalNode.setDefaultTextVisibility(!!localStorage["Comfy.PortalNode.DefaultVisibility"]);

		LiteGraph.registerNodeType(
			"Portal Declaration",
			Object.assign(PortalNode, {
				title_mode: LiteGraph.NO_TITLE,
				title: "Portal Definition",
				collapsable: false,
			})
		);

		PortalNode.category = "utils";

		/**
		 * @typedef { import("../../types/litegraph.js").LGraphNode } LGraphNode
		 * @type { LGraphNode }
		 */
		class PortalExit {
			setOptions() {

			}

			mapOutput(slot) {
				/**
				 * @type { INodeInputSlot }
				 */
				let input = this.getInputFromGlobal(slot);
				if (!input || input.type === '*') {
					return null
				}

				this.addOutput(input.name, input.type, input.value);
				
				// todo finish function, make applyToGraph work i guess?
			}

			getInputLink(slot) {
				const input = this.getInputFromGlobal(slot);
				if (input?.link === null) {
					return false;
				}

				return app.graph.links[input.link];
			}

			getInputNode(slot) {
				return this.getInputFromGlobal(slot)?.link;
			}

			getInputFromGlobal(slot) {
				if (!(this.properties.globalName in app.globalLinks)) {
					return null;
				}
				
				return app.globalLinks[this.properties.globalName].getInputInfo(slot);
			}

			setOutputs() {
				this.applyOrientation();

				this.outputs = [];

				const globalName = this.properties.globalName;
				if (globalName in app.globalLinks) {
					app.globalLinks[globalName].inputs.forEach((input, i) => {
						this.mapOutput(i);
					}, this);
				} else {
					this.outputs?.forEach((o) => this.removeOutput(o.slot_index));
				}
			}

			constructor() {
				if (!this.properties) {
					this.properties = {
						globalName: 'GLOBAL'
					};
				}
				this.properties.showOutputText = PortalExit.defaultVisibility;
				this.properties.horizontal = false;

				/**
				 * @typedef { import("../../types/litegraph.js").ITextWidget } ITextWidget
				 * @type { import("../../types/litegraph.js").WidgetCallback<ITextWidget> }
				 */
				this.addWidget( "combo", "Portal", 'GLOBAL', null, {
					values: Object.keys(app.globalLinks),
					property: 'globalName',
				});

				this.setOutputs();

				this.clone = function () {
					const cloned = PortalExit.prototype.clone.apply(this);
					cloned.size = cloned.computeSize();
					return cloned;
				};

				// This node is purely frontend and does not impact the resulting prompt so should not be serialized
				this.isVirtualNode = true;
			}

			// onConfigure(info) {
			// 	this.widgets[0].value = info.globalName ?? 'GLOBAL';
			// }

			onPropertyChanged(key, value) {
				// if (key === 'globalName') {
				// 	if (value in app.globalLinks) {
				// 		delete app.globalLinks[value];
				// 	}
				// 	app.globalLinks[value] = this;
				// }
			}

			onConnectionsChange(type, slotIndex, isConnected, link, ioSlot) {
				this.applyOrientation();

				this.setOutputs();
				// this.inputs = this.inputs.filter((input, i) => {
				// 	if (input.link === null) {
				// 		return false;
				// 	}

				// 	const link = app.graph.links[input.link];
				// 	const node = app.graph.getNodeById(link.origin_id);
				// 	const inputType = node.outputs[link.origin_slot]?.type ?? null;
				// 	const displayType = inputType || "*";
				// 	const color = LGraphCanvas.link_type_colors[displayType];

				// 	link.color = color;
				// 	input.type = displayType;
				// 	input.name = displayType;

				// 	return true;
				// }, this);

				// this.addInput("", "*");
			};

			getExtraMenuOptions(_, options) {
				options.unshift(
					{
						content: (this.properties.showOutputText ? "Hide" : "Show") + " Type",
						callback: () => {
							this.properties.showOutputText = !this.properties.showOutputText;
							if (this.properties.showOutputText) {
								this.outputs[0].name = this.__outputType || this.outputs[0].type;
							} else {
								this.outputs[0].name = "";
							}
							this.size = this.computeSize();
							this.applyOrientation();
							app.graph.setDirtyCanvas(true, true);
						},
					},
					{
						content: (PortalExit.defaultVisibility ? "Hide" : "Show") + " Type By Default",
						callback: () => {
							PortalExit.setDefaultTextVisibility(!PortalExit.defaultVisibility);
						},
					},
					{
						// naming is inverted with respect to LiteGraphNode.horizontal
						// LiteGraphNode.horizontal == true means that 
						// each slot in the inputs and outputs are layed out horizontally, 
						// which is the opposite of the visual orientation of the inputs and outputs as a node
						content: "Set " + (this.properties.horizontal ? "Horizontal" : "Vertical"),
						callback: () => {
							this.properties.horizontal = !this.properties.horizontal;
							this.applyOrientation();
						},
					}
				);
			}

			applyOrientation() {
				this.horizontal = this.properties.horizontal;
				this.outputs?.forEach((output, i) => {
					if (this.horizontal) {
						// we correct the output position, because LiteGraphNode.horizontal 
						// doesn't account for title presence
						// which reroute nodes don't have
						output.pos = [(this.size[0] * i) / (this.output.length + 1), 0];
					} else {
						delete output.pos;
					}
				});
				app.graph.setDirtyCanvas(true, true);
			}

			computeSize() {
				return [
					this.outputs && this.outputs.length && this.properties.globalName
						? Math.max(75, LiteGraph.NODE_TEXT_SIZE * (`  ${this.name}  ${this.properties.globalName}  `.length) * 0.5 + 40)
						: 75,
					26 * ((this.outputs ?? []).length + 1),
				];
			}

			static setDefaultTextVisibility(visible) {
				PortalExit.defaultVisibility = visible;
				if (visible) {
					localStorage["Comfy.PortalExit.DefaultVisibility"] = "true";
				} else {
					delete localStorage["Comfy.PortalExit.DefaultVisibility"];
				}
			}
		}

		// Load default visibility
		PortalExit.setDefaultTextVisibility(!!localStorage["Comfy.PortalExit.DefaultVisibility"]);

		LiteGraph.registerNodeType(
			"Portal Exit",
			Object.assign(PortalExit, {
				title_mode: LiteGraph.NO_TITLE,
				title: "Portal Exit",
				collapsable: false,
			})
		);

		PortalExit.category = "utils";
	},
});
