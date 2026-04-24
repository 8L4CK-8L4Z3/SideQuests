import fs from "fs/promises";
import path from "path";
let here = ".";
const folderRemover = async (rmpath) => {
  await fs.rm(rmpath, { recursive: true, force: true });
};

const getFolders = async (thepath) => {
  try {
    const entries = await fs.readdir(thepath, { withFileTypes: true });
    let folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(thepath, entry.name));

    for (const folder of folders) {
      folders = folders.concat(await getFolders(folder));
    }
    return folders;
  } catch (err) {
    console.error(err);
    return [];
  }
};

const purgeNamedDirs = async (thepath, name = "node_modules") => {
  let folders = await getFolders(thepath);
  for (const folder of folders) {
    if (folder == name || folder.endsWith(name)) {
      await folderRemover(folder);
    }
  }
};

//await recursiveExecution(here);
//console.log(await getFolders(here));
await purgeNamedDirs(here);
