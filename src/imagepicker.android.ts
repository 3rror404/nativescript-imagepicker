import * as observable from "tns-core-modules/data/observable";
import * as imagesource from "tns-core-modules/image-source";
import * as application from "tns-core-modules/application";
import * as platform from "tns-core-modules/platform";
import * as imageAssetModule from "tns-core-modules/image-asset";
import * as permissions from "nativescript-permissions";

interface ArrayBufferStatic extends ArrayBufferConstructor {
    from(buffer: java.nio.ByteBuffer): ArrayBuffer;
}

export class SelectedAsset extends imageAssetModule.ImageAsset {
    private _uri: android.net.Uri;
    private _fileUri: string;

    constructor(uri: android.net.Uri) {
        const fileUrl = SelectedAsset._calculateFileUri(uri);
        super(fileUrl);
        this._fileUri = fileUrl;
        this._uri = uri;
    }

    get thumbAsset(): imageAssetModule.ImageAsset {
        // TODO: implement with new imageAssetModule.ImageAsset 100x100
        // or show it in the demo instead
        return null;
    }

    get uri(): string {
        return this._uri.toString();
    }

    get fileUri(): string {
        return this._fileUri;
    }

    private static _calculateFileUri(uri: android.net.Uri) {
        let DocumentsContract = (<any>android.provider).DocumentsContract;
        let isKitKat = android.os.Build.VERSION.SDK_INT >= 19; // android.os.Build.VERSION_CODES.KITKAT

        if (isKitKat && DocumentsContract.isDocumentUri(application.android.context, uri)) {
            let docId, id, type;
            let contentUri: android.net.Uri = null;

            // ExternalStorageProvider
            if ("com.android.externalstorage.documents" === uri.getAuthority()) {
                docId = DocumentsContract.getDocumentId(uri);
                id = docId.split(":")[1];
                type = docId.split(":")[0];

                if ("primary" === type.toLowerCase()) {
                    return android.os.Environment.getExternalStorageDirectory() + "/" + id;
                }

                // TODO handle non-primary volumes
            }
            // DownloadsProvider
            else if ("com.android.providers.downloads.documents" === uri.getAuthority()) {
                id = DocumentsContract.getDocumentId(uri);
                contentUri = android.content.ContentUris.withAppendedId(
                    android.net.Uri.parse("content://downloads/public_downloads"), long(id));

                return SelectedAsset._getDataColumn(contentUri, null, null);
            }
            // MediaProvider
            else if ("com.android.providers.media.documents" === uri.getAuthority()) {
                docId = DocumentsContract.getDocumentId(uri);
                let split = docId.split(":");
                type = split[0];
                id = split[1];

                if ("image" === type) {
                    contentUri = android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                } else if ("video" === type) {
                    contentUri = android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                } else if ("audio" === type) {
                    contentUri = android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                }

                let selection = "_id=?";
                let selectionArgs = [id];

                return SelectedAsset._getDataColumn(contentUri, selection, selectionArgs);
            }
        }
        else {
            // MediaStore (and general)
            if ("content" === uri.getScheme()) {
                return SelectedAsset._getDataColumn(uri, null, null);
            }
            // FILE
            else if ("file" === uri.getScheme()) {
                return uri.getPath();
            }
        }

        return undefined;
    }

    private static _getDataColumn(uri: android.net.Uri, selection, selectionArgs) {
        let cursor = null;
        let columns = [android.provider.MediaStore.MediaColumns.DATA];
        let filePath;
        try {
            cursor = application.android.nativeApp.getContentResolver().query(uri, columns, selection, selectionArgs, null);
            if (cursor != null && cursor.moveToFirst()) {
                let column_index = cursor.getColumnIndexOrThrow(columns[0]);
                filePath = cursor.getString(column_index);
                if (filePath) {
                    return filePath;
                }
            }
        }
        catch (e) {
            console.log(e);
        }
        finally {
            if (cursor) {
                cursor.close();
            }
        }

        return undefined;
    }
}

export class ImagePicker {
    private _options;

    constructor(options) {
        this._options = options;
    }

    get mode(): string {
        return this._options && this._options.mode && this._options.mode.toLowerCase() === 'single' ? 'single' : 'multiple';
    }

    authorize(): Promise<void> {
        if ((<any>android).os.Build.VERSION.SDK_INT >= 23) {
            return permissions.requestPermission([(<any>android).Manifest.permission.READ_EXTERNAL_STORAGE]);
        } else {
            return Promise.resolve();
        }
    }

    present(): Promise<SelectedAsset[]> {
        return new Promise((resolve, reject) => {

            // WARNING: If we want to support multiple pickers we will need to have a range of IDs here:
            let RESULT_CODE_PICKER_IMAGES = 9192;

            let application = require("application");
            application.android.on(application.AndroidApplication.activityResultEvent, onResult);

            function onResult(args) {

                let requestCode = args.requestCode;
                let resultCode = args.resultCode;
                let data = args.intent;

                if (requestCode === RESULT_CODE_PICKER_IMAGES) {
                    if (resultCode === android.app.Activity.RESULT_OK) {

                        try {
                            let results = [];

                            let clip = data.getClipData();
                            if (clip) {
                                let count = clip.getItemCount();
                                for (let i = 0; i < count; i++) {
                                    let clipItem = clip.getItemAt(i);
                                    if (clipItem) {
                                        let uri = clipItem.getUri();
                                        if (uri) {
                                            results.push(new SelectedAsset(uri));
                                        }
                                    }
                                }
                            } else {
                                let uri = data.getData();
                                results.push(new SelectedAsset(uri));
                            }

                            application.android.off(application.AndroidApplication.activityResultEvent, onResult);
                            resolve(results);
                            return;

                        } catch (e) {
                            application.android.off(application.AndroidApplication.activityResultEvent, onResult);
                            reject(e);
                            return;

                        }
                    } else {
                        application.android.off(application.AndroidApplication.activityResultEvent, onResult);
                        reject(new Error("Image picker activity result code " + resultCode));
                        return;
                    }
                }
            }

            let Intent = android.content.Intent;
            let intent = new Intent();
            intent.setType("image/*");

            // TODO: Use (<any>android).content.Intent.EXTRA_ALLOW_MULTIPLE
            if (this.mode === 'multiple') {
                intent.putExtra("android.intent.extra.ALLOW_MULTIPLE", true);
            }

            intent.setAction(Intent.ACTION_GET_CONTENT);

            let chooser = Intent.createChooser(intent, "Select Picture");
            application.android.foregroundActivity.startActivityForResult(intent, RESULT_CODE_PICKER_IMAGES);
        });
    }
}

export function create(options?): ImagePicker {
    return new ImagePicker(options);
}
