import { Storage, TransferManager } from "@google-cloud/storage";


const storage = new Storage();

export async function listAllObjects(bucketName: string) {
  const [files] = await storage.bucket(bucketName).getFiles();
  console.log(`📦 Objects in gs://${bucketName}:`);
  for (const file of files) {
    console.log(file.name);
  }
}


export async function fetchFileFromGCS(bucketName: string, fileName: string) {
  console.log(`📥 Fetching file gs://${bucketName}/${fileName}...`);
  const [contents] = await storage.bucket(bucketName).file(fileName).download();
  console.log(`📥 Fetched file gs://${bucketName}/${fileName}`);
  return contents;
}

export async function fetchManyFilesFromGCS(bucketName: string, fileNames: string[]) {
  const transferManager = new TransferManager(storage.bucket(bucketName));
  const contents = await transferManager.downloadManyFiles(fileNames);
  return contents;
}