import type { Metadata } from "next";
import ProtoFrame from "@/components/proto/ProtoFrame";
import FolderTabs from "@/components/proto/FolderTabs";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Prototype: folder tabs" };

export default function Page() {
  return (
    <ProtoFrame title="Tabbed manila folders" blurb="Sections are colored file-folder tabs. Pick one to bring its folder to the front, showing a numbered field-guide table of contents.">
      <FolderTabs />
    </ProtoFrame>
  );
}
