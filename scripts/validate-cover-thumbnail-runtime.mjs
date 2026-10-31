import path from 'node:path';
import {resolveNativeProductionCli,nativeProductionCliOptions} from './resolve-native-production-cli.mjs';
const root=process.argv[2];
if(!root||!path.isAbsolute(root))throw Error('THUMBNAIL_RUNTIME_ROOT_INVALID');
resolveNativeProductionCli(nativeProductionCliOptions(root));
