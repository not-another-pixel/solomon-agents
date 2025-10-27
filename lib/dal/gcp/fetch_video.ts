import { Storage } from "@google-cloud/storage";

const storage = new Storage();

export async function listAllObjects(bucketName: string) {
  const [files] = await storage.bucket(bucketName).getFiles();
  console.log(`📦 Objects in gs://${bucketName}:`);
  for (const file of files) {
    console.log(file.name);
  }
}


export async function fetchFileFromGCS(bucketName: string, fileName: string) {

  const [contents] = await storage.bucket(bucketName).file(fileName).download();
  return contents;
}
