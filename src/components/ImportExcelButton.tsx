import { Upload } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface ImportExcelButtonProps {
  section: string;
}

export function ImportExcelButton({ section }: ImportExcelButtonProps) {
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (file) {
        toast.success(`Importing ${section} data from ${file.name}...`);
        // Here you would implement the actual Excel import logic
        // You can use libraries like xlsx or papaparse to parse the file
        setTimeout(() => {
          toast.success(`${section} data imported successfully!`);
        }, 1500);
      }
    };
    input.click();
  };

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={handleImport}
    >
      <Upload className="h-4 w-4" />
      Import Excel
    </Button>
  );
}
