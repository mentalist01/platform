using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

// A shared edge has one owner (the cell above/left), even though Excel and
// Calc serialize it on different sides. This prevents endless style echoes.
internal static class LiveWorkbookBorders
{
    private static readonly string[] Edges = ["left", "right", "top", "bottom"];
    private static readonly Dictionary<string, int> Strength = new()
    { ["hair"]=1,["thin"]=2,["dotted"]=2,["dashed"]=2,["dashDot"]=2,["dashDotDot"]=2,["medium"]=3,["mediumDashed"]=3,["mediumDashDot"]=3,["mediumDashDotDot"]=3,["slantDashDot"]=3,["thick"]=4,["double"]=5 };
    public static JsonObject? Pick(JsonObject? a, JsonObject? b)
    {
        if (a is null) return b; if (b is null) return a;
        int Compare(JsonObject x, JsonObject y) { int v=Strength[x["style"]!.GetValue<string>()].CompareTo(Strength[y["style"]!.GetValue<string>()]); return v!=0?v:string.CompareOrdinal(x.ToJsonString(), y.ToJsonString()); }
        return Compare(a,b)>=0?a:b;
    }
    public static JsonObject? Xml(XElement border, XElement? scheme, string[]? indexed)
    {
        var result=new JsonObject(); XNamespace ns=border.Name.Namespace;
        foreach (string edge in Edges)
        {
            var line=border.Element(ns+edge); string? style=(string?)line?.Attribute("style"); if (style is null or "none") continue;
            if (!Strength.ContainsKey(style)) throw new FormatException("Неподдерживаемая линия границы таблицы");
            var color=line!.Element(ns+"color"); int rgb=color is null?0:LiveWorkbookXml.Fill(new XElement(ns+"fill",new XElement(ns+"patternFill",new XAttribute("patternType","solid"),new XElement(ns+"fgColor",color.Attributes()))),scheme,indexed)??0;
            result[edge]=new JsonObject{["style"]=style,["color"]=rgb};
        }
        return result.Count>0?result:null;
    }
    public static (int Column,int Row) Position(string address)
    { int col=0,i=0;while(i<address.Length&&char.IsAsciiLetter(address[i]))col=col*26+address[i++]-'A'+1;return(col,int.Parse(address[i..])); }
    public static string Address(int column,int row)
    { string letters="";for(int n=column;n>0;n=(n-1)/26)letters=(char)('A'+(n-1)%26)+letters;return letters+row; }
    public static void Canonicalize(JsonObject cells)
    {
        var borders=new Dictionary<string,JsonObject>();
        foreach(var cell in cells.ToArray())
        {
            var raw=cell.Value!["borders"] as JsonObject;if(raw is null)continue;var (col,row)=Position(cell.Key);cell.Value.AsObject().Remove("borders");
            foreach(string edge in Edges)if(raw[edge] is JsonObject line)
            {
                string at=cell.Key,key=edge;
                if(edge=="left"&&col>1){at=Address(col-1,row);key="right";}
                if(edge=="top"&&row>1){at=Address(col,row-1);key="bottom";}
                if(!borders.TryGetValue(at,out var owned))borders[at]=owned=new();
                owned[key]=Pick(owned[key] as JsonObject,line)?.DeepClone();
            }
        }
        foreach(var pair in borders){cells[pair.Key]??=LiveWorkbookBook.EmptyCell();cells[pair.Key]!["borders"]=pair.Value;}
        foreach(var cell in cells.ToArray())if(LiveWorkbookBook.IsEmpty(cell.Value!))cells.Remove(cell.Key);
        if(cells.Count>250000)throw new LiveWorkbookCapacityException("В совместном режиме допускается до 250 000 заполненных ячеек");
    }
    private static void Release(object o){if(Marshal.IsComObject(o))Marshal.FinalReleaseComObject(o);}
    private static int Index(string edge)=>edge switch{"left"=>7,"top"=>8,"bottom"=>9,_=>10};
    private static JsonObject? ReadEdge(dynamic sheet,string address,string edge)
    {
        dynamic cell=sheet.Range[address],borders=cell.Borders,line=borders.Item[Index(edge)];
        try{
            int kind=Convert.ToInt32(line.LineStyle);if(kind==-4142)return null;int weight=Convert.ToInt32(line.Weight),color=Convert.ToInt32(line.Color);
            string style=kind switch{-4119=>"double",-4118=>"dotted",-4115=>weight==-4138?"mediumDashed":"dashed",4=>weight==-4138?"mediumDashDot":"dashDot",5=>weight==-4138?"mediumDashDotDot":"dashDotDot",13=>"slantDashDot",_=>weight switch{1=>"hair",-4138=>"medium",4=>"thick",_=>"thin"}};
            return new(){["style"]=style,["color"]=(color&255)<<16|color&0xff00|color>>16&255};
        }finally{Release(line);Release(borders);Release(cell);}
    }
    public static JsonObject? ReadExcel(dynamic sheet,string address)
    {
        var (col,row)=Position(address);var result=new JsonObject();
        foreach(string edge in Edges){if(edge=="left"&&col>1||edge=="top"&&row>1)continue;
            var line=ReadEdge(sheet,address,edge);
            if(edge=="right"&&col<16384)line=Pick(line,ReadEdge(sheet,Address(col+1,row),"left"));
            if(edge=="bottom"&&row<1048576)line=Pick(line,ReadEdge(sheet,Address(col,row+1),"top"));
            if(line is not null)result[edge]=line.DeepClone();
        }return result.Count>0?result:null;
    }
    private static void WriteEdge(dynamic sheet,string address,string edge,JsonNode? value)
    {
        dynamic cell=sheet.Range[address],borders=cell.Borders,line=borders.Item[Index(edge)];
        try{
            if(value is null){line.LineStyle=-4142;return;}
            string style=value["style"]!.GetValue<string>();int color=value["color"]!.GetValue<int>();
            line.LineStyle=style switch{"double"=>-4119,"dotted"=>-4118,"dashed" or "mediumDashed"=>-4115,"dashDot" or "mediumDashDot"=>4,"dashDotDot" or "mediumDashDotDot"=>5,"slantDashDot"=>13,_=>1};
            if(style!="double")line.Weight=style switch{"hair"=>1,"thick"=>4,"medium" or "mediumDashed" or "mediumDashDot" or "mediumDashDotDot" or "slantDashDot"=>-4138,_=>2};
            line.Color=(color&255)<<16|color&0xff00|color>>16&255;
        }finally{Release(line);Release(borders);Release(cell);}
    }
    public static void WriteExcel(dynamic sheet,string address,JsonNode? value)
    {
        var (col,row)=Position(address);
        foreach(string edge in Edges){if(edge=="left"&&col>1||edge=="top"&&row>1)continue;
            WriteEdge(sheet,address,edge,value?[edge]);
            if(edge=="right"&&col<16384)WriteEdge(sheet,Address(col+1,row),"left",value?[edge]);
            if(edge=="bottom"&&row<1048576)WriteEdge(sheet,Address(col,row+1),"top",value?[edge]);
        }
    }
}
