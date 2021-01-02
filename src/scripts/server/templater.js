/*

MIT License

Copyright (c) 2020 poidasmith

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

let templater = {};

/**
 * Get the template for the given template name
 */
templater.templateOf = function (templateName) {
    return template = templater.parse(templates[templateName] || templates["house"]);
};

/**
 * Executes fill commands for the given block template
 */
templater.fill = function (templateName, position, direction) {

    system.logf("Generating template '{0}' at {1} with direction {2}", templateName, JSON.stringify(position), direction);

    // Get the template
    const template = templater.templateOf(templateName);

    // Render the template
    return templater.fillTemplate(template, position, direction);
};

templater.fillTemplate = function (template, position, direction) {

    let { tokens, layers, depth, height, width, offset } = template;

    // Calculate starting position and template size
    let updatedPosition = this.applyOffset(position, direction, offset);
    let { x: x0, y: y0, z: z0 } = updatedPosition;

    // Fill the base layer if specified
    if (template.base)
        templater.fillBase(template, updatedPosition, direction);

    // Loop through layers and fill in tokens - we loop through twice, placing solid blocks first
    for (var mode of ["solid", "attachments"]) {
        for (i = 0; i < depth; i++) {
            for (j = 0; j < height; j++) {
                for (k = 0; k < width; k++) {
                    var key = layers[i][j][k];
                    var token = tokens[key];
                    if (typeof (token) === "undefined") {
                        system.logf("Missing key {0}", key);
                        token = "magenta_glazed_terracotta"; // missing a key, make it stand out
                    }

                    // Check for solid vs attachment blocks
                    // - we only place attachment blocks (like torches) in second pass
                    var isAttachmentBlock = templater.isAttachmentBlock(token);
                    if ((isAttachmentBlock && mode === "solid") || (!isAttachmentBlock && mode === "attachments"))
                        continue;

                    // Check for fill or summon
                    var createFn = system.create;
                    if (token.startsWith("$")) {
                        createFn = system.summon;
                        token = token.substring(1);

                        // Check for multiplier
                        var parts = token.split(" ");
                        if (parts.length > 1 && parts[1].startsWith("count")) { // $chicken count:4
                            var times = parseInt(parts[1].substring(6));
                            createFn = function (...args) {
                                for (var i = 0; i < times; i++)
                                    system.summon(...args);
                            };
                            token = parts[0];
                        }
                    }

                    // Check if we need to rotate the block
                    if (token.indexOf(" ") !== -1) {
                        var parts = token.split(" ");
                        token = parts[0];
                        var tileData = parts[1] || "2";
                        if (token.indexOf("stairs") !== -1)
                            token = system.format("{0} {1}", token, templater.rotateStairs(tileData, direction));
                        else if (token === "bed")
                            token = system.format("{0} {1}", token, templater.rotateBed(tileData, direction));
                        else if (token === "chest")
                            token = system.format("{0} {1}", token, templater.rotateChest(tileData, direction));
                        else if (token === "torch")
                            token = system.format("{0} {1}", token, templater.rotateTorch(tileData, direction));
                        else if (token === "fence_gate")
                            token = system.format("{0} {1}", token, templater.rotateFence(tileData, direction));
                        else if (token === "vine")
                            token = system.format("{0} {1}", token, templater.rotateVine(tileData, direction));
                    }

                    // Calculate position of block and fill
                    switch (direction) {
                        case "north":
                            var x = Math.floor(x0 + (width / 2) - k);
                            var y = y0 + j;
                            var z = z0 + depth - i;
                            createFn(token, x, y, z);
                            break;
                        case "south":
                            var x = Math.ceil(x0 - (width / 2) + k);
                            var y = y0 + j;
                            var z = z0 - depth + i;
                            createFn(token, x, y, z);
                            break;
                        case "east":
                            var z = Math.ceil(z0 - (width / 2) + k);
                            var y = y0 + j;
                            var x = x0 - depth + i;
                            createFn(token, x, y, z);
                            break;
                        case "west":
                            var z = Math.floor(z0 + (width / 2) - k);
                            var y = y0 + j;
                            var x = x0 + depth - i;
                            createFn(token, x, y, z);
                            break;
                    }
                }
            }
        }
    }
};

/**
 * Parse a template string into tokens, layers and properties
 */
templater.parse = function (templateStr) {

    // Split the template into tokens and layers
    var tokens = {};
    var layers = [];
    var lines = templateStr.split("\n");
    var offset = { x: 0, y: 0, z: 0 };
    var base = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        // Check for comment lines
        if (line.trim().length == 0 || line.startsWith("#")) {
            continue;
        }
        // Look for variables
        if (line.indexOf("=") !== -1) {
            var parts = line.split("=");
            var key = parts[0].trim();
            var value = parts[1].trim();
            tokens[key] = value;
        } else if (line.startsWith(" ")) { // Layers start with at least one space    
            layers.push(line.trim().split("   ").map(s => s.split(" ")));
        } else if (line.startsWith("> offset ")) { // Look for offset feature
            var offsets = line.substring(9).trim().split(" ").map(s => parseInt(s));
            offset.x = offsets[0];
            offset.y = offsets[1];
            offset.z = offsets[2];
        } else if (line.startsWith("> base ")) { // Look for base (foundation layer) feature
            var parts = line.substring(7).trim().split(" ");
            base = { block: parts[0] };
            for (var z = 1; z < parts.length; z++) {
                var prop = parts[z].split(":");
                base[prop[0]] = prop[1];
            }
        }
    }

    // Calculate dimensions
    let depth = layers.length;
    let height = layers[0].length;
    let width = layers[0][0].length;

    return {
        tokens,
        layers,
        depth,
        height,
        width,
        offset,
        base
    };
};

/**
 * Fill the base (foundation layer) with specified block
 */
templater.fillBase = function (template, position, direction) {  
    let { base, width, depth } = template;
    let { x0, y0, z0 } = position;
    var margin = parseInt(base.margin || "0");
    switch (direction) {
        case "north":
            var x1 = x0 - Math.floor(width / 2) - margin;
            var x2 = x0 + Math.floor(width / 2) + margin - 1;
            var z1 = z0 - margin + 1;
            var z2 = z0 + depth + margin;
            system.fill(base.block, x1, y0 - 1, z1, x2, y0 - 1, z2);
            break;
        case "south":
            var x1 = x0 - Math.floor(width / 2) - margin;
            var x2 = x0 + Math.floor(width / 2) + margin;
            var z1 = z0 + margin - 1;
            var z2 = z0 - depth - margin;
            system.fill(base.block, x1, y0 - 1, z1, x2, y0 - 1, z2);
            break;
        case "east":
            var x1 = x0 - depth - margin;
            var x2 = x0 + margin;
            var z1 = z0 - Math.floor(width / 2) - margin;
            var z2 = z0 + Math.floor(width / 2) + margin;
            system.fill(base.block, x1, y0 - 1, z1, x2, y0 - 1, z2)
            break;
        case "west":
            var x1 = x0 + depth + margin;
            var x2 = x0 - margin;
            var z1 = z0 + Math.floor(width / 2) + margin;
            var z2 = z0 - Math.floor(width / 2) - margin;
            system.fill(base.block, x1, y0 - 1, z1, x2, y0 - 1, z2)
            break;
    }
};

/**
 * Determine if this block needs to be attached to an adjacent block
 */
templater.isAttachmentBlock = function (token) {
    var blocks = ["torch", "lantern", "vine", "bell"];
    for (var block of blocks)
        if (token.indexOf(block) !== -1)
            return true;
    return false;
};

/**
 * Map the numeric direction from a sign to north/south/east/west text
 */
templater.directionTextOf = function (dir) {
    if (dir < 4)
        return "south";
    else if (dir < 8)
        return "west";
    else if (dir < 12)
        return "north";
    else if (dir < 16)
        return "east";
    return "north";
}

/**
 * Apply an offset given the initial position and direction
 */
templater.applyOffset = function (position, direction, offset) {
    let { x, y, z } = position;
    let { x: xd, y: yd, z: zd } = offset;
    y += yd;
    switch (direction) {
        case "north":
            x += xd;
            z += zd;
            break;
        case "south":
            x -= xd;
            z -= zd;
            break;
        case "east":
            x += zd;
            z += xd;
            break;
        case "west":
            x -= zd;
            z -= xd;
            break;
    };
    return { x: x, y: y, z: z };
};

// ==== Rotation Helpers ==============================

templater.rotateStairs = function (tileData, direction) {
    const rotation = {
        "0": { "west": "2", "east": "3", "north": "0", "south": "1" },
        "1": { "west": "3", "east": "2", "north": "1", "south": "0" },
        "2": { "west": "0", "east": "1", "north": "2", "south": "3" },
        "3": { "west": "1", "east": "0", "north": "3", "south": "2" }
    };
    return rotation[tileData][direction] || "2";
};

templater.rotateBed = function (tileData, direction) {
    const rotation = {
        "0": { "west": "1", "east": "3", "south": "2", "north": "0" },
        "1": { "west": "2", "east": "0", "south": "3", "north": "1" },
        "2": { "west": "3", "east": "1", "south": "0", "north": "2" },
        "3": { "west": "0", "east": "2", "south": "1", "north": "3" }
    };
    return rotation[tileData][direction] || "2";
};

templater.rotateChest = function (tileData, direction) {
    const rotation = {
        "2": { "west": "4", "east": "5", "south": "3", "north": "2" },
        "3": { "west": "5", "east": "4", "south": "2", "north": "3" },
        "4": { "west": "2", "east": "3", "south": "5", "north": "4" },
        "5": { "west": "3", "east": "2", "south": "4", "north": "5" }
    };
    return rotation[tileData][direction] || "2";
};

templater.rotateTorch = function (tileData, direction) {
    const rotation = {
        "1": { "west": "4", "east": "4", "south": "2", "north": "1" },
        "2": { "west": "3", "east": "3", "south": "1", "north": "2" },
        "3": { "west": "1", "east": "2", "south": "4", "north": "3" },
        "4": { "west": "2", "east": "1", "south": "3", "north": "4" }
    };
    return rotation[tileData][direction] || "2";
};

templater.rotateFence = function (tileData, direction) {
    const rotation = {
        "0": { "west": "1", "east": "1", "south": "0", "north": "0" },
        "1": { "west": "0", "east": "0", "south": "1", "north": "1" }
    };
    return rotation[tileData][direction] || "0";
};

templater.rotateVine = function (tileData, direction) {
    const rotation = {
        "1": { "west": "3", "east": "2", "south": "4", "north": "1" },
        "2": { "west": "4", "east": "1", "south": "3", "north": "2" },
        "3": { "west": "1", "east": "4", "south": "2", "north": "3" },
        "4": { "west": "2", "east": "3", "south": "1", "north": "4" }
    };
    return rotation[tileData][direction] || "2";
};

