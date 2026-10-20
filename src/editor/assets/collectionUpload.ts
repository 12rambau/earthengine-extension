/** @module collectionUpload — Creates image collections and submits one ingestion per source raster. */

import * as vscode from 'vscode';
import { AuthService } from '../../auth/index.js';
import { collectionImageNames, createImageCollection } from '../../sidebar/assets/eeApiClient.js';
import { NewAssetRequest, uploadNewAsset, UploadProgress } from './assetUpload.js';

/** Metadata and sources selected in the Asset Manager. */
export interface NewCollectionRequest {
  assetId: string;
  title: string;
  description: string;
  bucket: string;
  source: 'empty' | 'zarr' | 'cogs';
  files: string[];
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
    !['empty', 'zarr', 'cogs'].includes(request.source) ||
    (request.source === 'empty' && request.files.length !== 0) ||
    (request.source === 'zarr' && request.files.length !== 1) ||
    (request.source === 'cogs' && request.files.length === 0) ||
    (request.source !== 'empty' && !request.bucket.trim())
  ) {
    throw new Error('Select valid image collection sources and a staging bucket.');
  }
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated.');
  }
  await createImageCollection(request.assetId, request.title, request.description, token);

  const names = collectionImageNames(request.files);
  let submitted = 0;
  for (let index = 0; index < request.files.length; index++) {
    const imageRequest: NewAssetRequest = {
      kind: 'image',
      assetId: `${request.assetId}/${names[index]}`,
      filePath: request.files[index],
      bucket: request.bucket,
      bandNames: [],
      pyramidingPolicy: 'MEAN',
      description: '',
      startTime: '',
      endTime: '',
      properties: [],
    };
    try {
      onProgress(`Image ${index + 1}/${request.files.length}: ${names[index]}`);
      const operation = await uploadNewAsset(imageRequest, authService, context, onProgress);
      submitted++;
      await onOperation(operation);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Collection created; ${submitted} of ${request.files.length} image ingestion(s) submitted. ` +
          `Failed on ${names[index]}: ${reason}`,
      );
    }
  }
  return submitted;
}
