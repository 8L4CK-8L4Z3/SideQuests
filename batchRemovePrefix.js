import fs from "fs/promises";
import path from "path";

const folderpath = ".";
const prefix = "[Judas] ";
let count = 0;

const getFolders = async (thepath) => {
  try {
    const entries = await fs.readdir(thepath, { withFileTypes: true });
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(thepath, entry.name));
    return folders;
  } catch (err) {
    console.error(err);
    return [];
  }
};

const getFiles = async (thepath) => {
  try {
    const entries = await fs.readdir(thepath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    return files;
  } catch (err) {
    console.error(err);
    return [];
  }
};

const removePrefixe = async (folder, file, prefix) => {
  try {
    if (file.startsWith(prefix)) {
      const newName = file.slice(prefix.length);
      console.log(`Renaming: "${file}" → "${newName}" in ${folder}`);
      await fs.rename(path.join(folder, file), path.join(folder, newName));
      count++;
    }
  } catch (err) {
    console.error(err);
  }
};

// Recursive function to process all subdirectories
const processDirectoryRecursively = async (thepath, prefix) => {
  // Process files in current directory
  const files = await getFiles(thepath);
  for (const file of files) {
    await removePrefixe(thepath, file, prefix);
  }

  // Get subdirectories and process them recursively
  const folders = await getFolders(thepath);
  for (const folder of folders) {
    await processDirectoryRecursively(folder, prefix);
  }
};

const batchRename = async (thepath, prefix) => {
  console.log(`Starting recursive batch rename from: ${thepath}\n`);
  count = 0; // Reset counter
  await processDirectoryRecursively(thepath, prefix);
  console.log(`\n${count} File(s) Renamed Successfully\n`);
};

// Recursive function to check all directories
const checkDirectoryRecursively = async (thepath, indent = "") => {
  const files = await getFiles(thepath);

  if (files.length > 0) {
    console.log(`${indent}Files in: ${thepath}`);
    files.forEach((file) => console.log(`${indent}  - ${file}`));
    console.log();
  }

  const folders = await getFolders(thepath);
  for (const folder of folders) {
    await checkDirectoryRecursively(folder, indent + "  ");
  }
};

const checkAfterRename = async (thepath) => {
  console.log(`\n=== Directory Structure ===\n`);
  await checkDirectoryRecursively(thepath);
};

// Uncomment to run batch rename
// batchRename(folderpath, prefix);

// Check current structure
checkAfterRename(folderpath);
