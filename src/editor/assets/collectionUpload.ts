/** @module collectionUpload — Creates image collections and submits one ingestion per source raster. */

import * as vscode from 'vscode';
import { AuthService } from '../../auth/index.js';
import { collectionImageNames, createImageCollection } from '../../sidebar/assets/eeApiClient.js';
import { AssetProperty, NewAssetRequest, uploadNewAsset, UploadProgress } from './assetUpload.js';
import { CollectionRaster } from './rasterToCog.js';

/** Metadata and sources selected in the Asset Manager. */
export interface NewCollectionRequest {
  assetId: string;
  description: string;
  startTime: string;
  endTime: string;
  properties: AssetProperty[];
  bandNames: string[];
  pyramidingPolicy: string;
  bucket: string;
  source: 'empty' | 'zarr' | 'cogs' | 'vrt';
  images: CollectionRaster[];
}

/**
 * Creates the container first, then stages each source and starts an independent
 * image ingestion. Submitted operations keep running in parallel on Earth Engine.
 * On partial failure, the collection and already submitted images are preserved.
 */
export async function uploadImageCollection(
  request: NewCollectionRequest,
  authService: AuthService,
  context: vscode.ExtensionContext,
  onProgress: UploadProgress,
  onOperation: (name: string) => Promise<void>,
): Promise<number> {
  const project = authService.currentProfile?.project;
  if (!project || !request.assetId.startsWith(`projects/${project}/assets/`)) {
    throw new Error('The destination must belong to the active project.');
  }
  if (
    !['empty', 'zarr', 'cogs', 'vrt'].includes(request.source) ||
    (request.source === 'empty' && request.images.length !== 0) ||
    (request.source !== 'empty' &&
      (!request.images.length ||
        !request.bucket.trim() ||
        !request.bandNames.length ||
        request.bandNames.some((name) => !name.trim()) ||
        !['MEAN', 'MODE', 'SAMPLE', 'MIN', 'MAX'].includes(request.pyramidingPolicy) ||
        request.images.some((image) => image.bandCount !== request.bandNames.length)))
  ) {
    throw new Error('Select valid image collection sources and a staging bucket.');
  }
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated.');
  }
  await createImageCollection(
    request.assetId,
    {
      description: request.description,
      startTime: request.startTime,
      endTime: request.endTime,
      properties: request.properties,
    },
    token,
  );

  const names = collectionImageNames(request.images.map((image) => image.name));
  let submitted = 0;
  for (let index = 0; index < request.images.length; index++) {
    const imageRequest: NewAssetRequest = {
      kind: 'image',
      assetId: `${request.assetId}/${names[index]}`,
      filePath: request.images[index].path,
      bandIndex: request.images[index].bandIndex,
      bucket: request.bucket,
      bandNames: request.bandNames,
      pyramidingPolicy: request.pyramidingPolicy,
      description: '',
      startTime: '',
      endTime: '',
      properties: [],
    };
    try {
      onProgress(`Image ${index + 1}/${request.images.length}: ${names[index]}`);
      const operation = await uploadNewAsset(imageRequest, authService, context, onProgress);
      submitted++;
      await onOperation(operation);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Collection created; ${submitted} of ${request.images.length} image ingestion(s) submitted. ` +
          `Failed on ${names[index]}: ${reason}`,
      );
    }
  }
  return submitted;
}
