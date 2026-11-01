using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

// Column sizes are document geometry in logical 96-DPI pixels. They do not
// contain monitor coordinates, zoom, selection or either participant's scroll.
internal static class LiveWorkbookColumns
{
    private static readonly XNamespace S="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static readonly XNamespace R="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    public static IEnumerable<(int Start,int End)> Ranges(XDocument document)
    {
        var boundaries=new SortedSet<int>{1,16385};
        foreach(var col in document.Root?.Element(S+"cols")?.Elements(S+"col")??[])
        {
            int start=(int?)col.Attribute("min")??1,end=(int?)col.Attribute("max")??start;
            if(start<1||end<start||end>16384)throw new FormatException("Некорректные размеры столбцов");
            boundaries.Add(start);boundaries.Add(end+1);
        }
        int[] points=boundaries.ToArray();for(int i=1;i<points.Length;i++)yield return(points[i-1],points[i]-1);
    }
    public static void Append(JsonArray result,int start,int end,int pixels)
    {
        if(pixels<0||pixels>100000)throw new FormatException("Недопустимая ширина столбца");
        if(result.Count>0&&result[^1]![1]!.GetValue<int>()==start-1&&result[^1]![2]!.GetValue<int>()==pixels)result[^1]![1]=end;
        else result.Add(new JsonArray(start,end,pixels));
    }
    public static JsonObject ReadExcel(dynamic book,string file)
    {
        using var archive=ZipFile.OpenRead(file);
        XDocument Read(string name){using var stream=archive.GetEntry(name)!.Open();return XDocument.Load(stream);}
        var links=Read("xl/_rels/workbook.xml.rels").Root!.Elements().ToDictionary(e=>(string)e.Attribute("Id")!,e=>(string)e.Attribute("Target")!);
        var result=new JsonObject();
        foreach(var source in Read("xl/workbook.xml").Root!.Element(S+"sheets")!.Elements())
        {
            string name=(string)source.Attribute("name")!,target=links[(string)source.Attribute(R+"id")!].Replace('\\','/');
            string entry=target.StartsWith('/')?target.TrimStart('/') : "xl/"+target;
            if(entry.Contains("..",StringComparison.Ordinal))throw new FormatException("Некорректный путь листа");
            dynamic sheet=book.Worksheets[name];var columns=new JsonArray();
            try
            {
                foreach(var (start,end) in Ranges(Read(entry)))
                {
                    dynamic range=sheet.Range[LiveWorkbookBorders.Address(start,1)+":"+LiveWorkbookBorders.Address(end,1)];
                    try{Append(columns,start,end,(int)Math.Round(Convert.ToDouble(range.Width)*4/3/(end-start+1)));}
                    finally{Marshal.ReleaseComObject(range);}
                }
            }
            finally{Marshal.ReleaseComObject(sheet);}
            result[name]=columns;
        }
        return result;
    }
    public static void Overlay(JsonObject book,JsonObject? columns)
    {
        if(columns is null)return;
        foreach(var sheet in book["sheets"]!.AsArray())
        {
            if(columns[sheet!["name"]!.GetValue<string>()] is not JsonArray widths)continue;
            var layout=sheet["layout"] as JsonObject??new JsonObject();layout["columns"]=widths.DeepClone();
            if(sheet["layout"] is null)sheet["layout"]=layout;
        }
    }
    public static void WriteExcel(dynamic sheet,JsonNode? layout,JsonNode? previous=null)
    {
        foreach(var item in layout?["columns"]?.AsArray()??[])
        {
            int start=item![0]!.GetValue<int>(),end=item[1]!.GetValue<int>(),pixels=item[2]!.GetValue<int>();
            if(previous?["columns"]?.AsArray().Any(p=>p![0]!.GetValue<int>()<=start&&p[1]!.GetValue<int>()>=end&&p[2]!.GetValue<int>()==pixels)==true)continue;
            dynamic range=sheet.Range[LiveWorkbookBorders.Address(start,1)+":"+LiveWorkbookBorders.Address(end,1)],columns=range.EntireColumn;
            try
            {
                if(pixels==0){columns.Hidden=true;continue;}
                columns.Hidden=false;
                double low=0,high=255;bool matched=false;
                for(int step=0;step<22;step++)
                {
                    double width=(low+high)/2;columns.ColumnWidth=width;
                    int actual=(int)Math.Round(Convert.ToDouble(range.Width)*4/3/(end-start+1));
                    if(actual==pixels){matched=true;break;}
                    if(actual<pixels)low=width;else high=width;
                }
                if(!matched)throw new InvalidOperationException("Excel не смог применить ширину столбцов "+start+":"+end);
            }
            finally{Marshal.ReleaseComObject(columns);Marshal.ReleaseComObject(range);}
        }
    }
}
