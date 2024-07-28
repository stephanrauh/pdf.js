import canvasSize from "canvas-size";

// modified (added) by ngx-extended-pdf-viewer #387
export class MaxCanvasSize {
  static maxWidth = null;

  static maxHeight = null;

  static maxArea = null;

  static async determineMaxArea() {
    const { success, width, height } = await canvasSize.maxArea({ useWorker: true });
    if (!success) {
      MaxCanvasSize.maxWidth = 4096;
      MaxCanvasSize.maxArea = 16777216;
      return 4096;
    }

    MaxCanvasSize.maxArea = width * height;
    return MaxCanvasSize.maxArea;
  }

  static async determineMaxWidth() {
    const { width } = await canvasSize.maxWidth({ useWorker: true });
    MaxCanvasSize.maxWidth = width;
    return MaxCanvasSize.maxWidth;
  }

  static async determineMaxHeight() {
    const { height } = await canvasSize.maxHeight({ useWorker: true });
    MaxCanvasSize.maxHeight = height;
    return MaxCanvasSize.maxHeight;
  }

  static async determineMaxDimensions() {
    if (MaxCanvasSize.maxWidth) {
      return MaxCanvasSize.maxWidth;
    }
    await this.determineMaxArea();
    await this.determineMaxHeight();
    await this.determineMaxWidth();

    return MaxCanvasSize.maxWidth;
  }

  static async reduceToMaxCanvasSize(width, height) {
    let divisor = 1;
    if (width >= 4096 || height >= 4096) {
      await this.determineMaxDimensions();

      divisor = Math.max(
        width / MaxCanvasSize.maxWidth,
        height / MaxCanvasSize.maxHeight,
        Math.sqrt((width * height) / MaxCanvasSize.maxArea)
      );

      if (divisor > 1) {
        divisor = Math.ceil(1 + 100 * divisor) / 100; // round to integer percentages and add some margin to play it safe
      }
    }
    return divisor;
  }
}
