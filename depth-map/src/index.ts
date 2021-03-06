/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tfconv from '@tensorflow/tfjs-converter';
import * as tf from '@tensorflow/tfjs-core';

const INPUT_SIZE = 224;

export interface ModelConfig {
  modelUrl?: string | tf.io.IOHandler,
  inputRange?: [number, number],
}

/**
 * DepthMap model loading configuration
 *
 * @param modelUrl Optional param for specifying the custom model url or `tf.io.IOHandler` object.
 * @param inputRange Optional param specifying the pixel value range of your input. This is typically [0, 255] or [0, 1].
  Defaults to [0, 255].
 */
export async function load(modelConfig: ModelConfig = {modelUrl: 'https://raw.githubusercontent.com/grasskin/tfjs-models/master/depth-map/fastdepth_opset9_v2_tfjs/model.json', inputRange: [0, 255]}): Promise<DepthMap> {
  let inputMin = 0;
  let inputMax = 255;
  let modelUrl: string | tf.io.IOHandler = 'https://raw.githubusercontent.com/grasskin/tfjs-models/master/depth-map/fastdepth_opset9_v2_tfjs/model.json';
  //TODO add tfhub compat
  if (tf == null) {
    throw new Error(
      `Cannot find TensorFlow.js. If you are using a <script> tag, please ` +
      `also include @tensorflow/tfjs on the page before using this model.`);
  }
  if(modelConfig.modelUrl != null) {
    modelUrl = modelConfig.modelUrl; 
  }
  if(modelConfig.inputRange != null) {
    [inputMin, inputMax] = modelConfig.inputRange
  }
  const depthmap = new DepthMap(modelUrl, inputMin, inputMax);
  await depthmap.load();
  return depthmap;
}

export class DepthMap {
  private model: tfconv.GraphModel;
  private normalizationConstant: number;

  constructor(public modelUrl: string | tf.io.IOHandler, public inputMin: number = 0, public inputMax: number = 255, public rawOutput: boolean = false) {
    this.normalizationConstant = (inputMax - inputMin);
  }

  public async load() : Promise<void> {
    this.model = await tfconv.loadGraphModel(this.modelUrl);
  }

  public async warmup() : Promise<void> {
    // Warmup the model.
    const result = tf.tidy(() => this.model.predict(tf.zeros([1, 3, INPUT_SIZE, INPUT_SIZE]))) as tf.Tensor;
    await result.data();
    result.dispose();
  }
  
  /**
   * Run depth inference through model
   *
   * @param img The image to classify. Can be a tensor or a DOM element image,
   * video, or canvas.
   */
  public predict(
      img: tf.Tensor3D|ImageData|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement): tf.Tensor2D {
      return tf.tidy(() => {
        if(!(img instanceof tf.Tensor)) {
          img = tf.browser.fromPixels(img);
        }
        // Resize the image to [224, 224]
        let resized : tf.Tensor3D = img.toFloat();
        if (img.shape[0] !== INPUT_SIZE || img.shape[1] !== INPUT_SIZE) {
          const alignCorners = true;
          resized = tf.image.resizeBilinear(img, [INPUT_SIZE, INPUT_SIZE], alignCorners);
        }
        const reshaped : tf.Tensor3D = tf.transpose(resized, [2, 0, 1]); // change image from [224,224,3] to [3,224,224]
        const batched : tf.Tensor3D = reshaped.expandDims()
        // Normalize input from [inputMin, inputMax] to [0,1]
        const normalized: tf.Tensor3D = batched.sub(this.inputMin).div(this.normalizationConstant);
        const out : tf.Tensor = this.model.predict(normalized);
        const resizeOut : tf.Tensor2D = out.reshape([INPUT_SIZE, INPUT_SIZE]);
        return resizeOut;
      });
  }
}
