using System.Globalization;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

internal static class LiveWorkbookFormatting
{
    private static readonly XNamespace S="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static void Release(object? value){if(value is not null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value);}
    private static readonly JsonObject Standard=JsonNode.Parse("""{"font":{"name":"Calibri","size":11,"color":0,"bold":false,"italic":false,"underline":"none","strike":false},"alignment":{"horizontal":"general","vertical":"bottom","wrap":false,"shrink":false,"rotation":0},"numberFormat":"General"}""")!.AsObject();
    public static JsonObject Resolve(JsonNode? relative,JsonNode? defaults)
    {
        var result=(JsonObject)(defaults?.DeepClone()??new JsonObject());
        if(relative is not JsonObject supplied)return result;
        foreach(var item in supplied)
        {
            if(item.Value is JsonObject fields)
            {
                var target=result[item.Key] as JsonObject??new JsonObject();
                foreach(var field in fields)target[field.Key]=field.Value?.DeepClone();
                if(result[item.Key] is null)result[item.Key]=target;
            }
            else result[item.Key]=item.Value?.DeepClone();
        }
        return result;
    }
    public static JsonObject? Relative(JsonNode? absolute,JsonNode? defaults)
    {
        var actual=Resolve(absolute,Standard);var baseline=Resolve(defaults,Standard);var result=new JsonObject();
        foreach(var item in actual)
        {
            if(item.Value is JsonObject fields)
            {
                var changed=new JsonObject();foreach(var field in fields)if(!JsonNode.DeepEquals(field.Value,baseline[item.Key]?[field.Key]))changed[field.Key]=field.Value?.DeepClone();
                if(changed.Count>0)result[item.Key]=changed;
            }
            else if(!JsonNode.DeepEquals(item.Value,baseline[item.Key]))result[item.Key]=item.Value?.DeepClone();
        }
        return result.Count>0?result:null;
    }
    public static object ExcelRange(object sheet,string address)
    {
        // Multi-area string separators vary with Excel's automation locale.
        // Union accepts native ranges and never parses a localized separator.
        string[] parts=address.Split(',',StringSplitOptions.RemoveEmptyEntries);
        dynamic owner=sheet;object current=owner.Range[parts[0]];
        if(parts.Length==1)return current;
        dynamic app=owner.Application;
        try
        {
            foreach(string part in parts.Skip(1))
            {
                object next=owner.Range[part];object combined;
                try{combined=app.Union(current,next);}finally{Release(next);}
                Release(current);current=combined;
            }
            return current;
        }
        catch{Release(current);throw;}
        finally{Release(app);}
    }
    public static IEnumerable<string> CompactRanges(IEnumerable<string> addresses)
    {
        static (int Column,int Row) At(string address){int column=0,index=0;foreach(char letter in address){if(!char.IsAsciiLetterUpper(letter))break;column=column*26+letter-'A'+1;index++;}return(column,int.Parse(address[index..],CultureInfo.InvariantCulture));}
        static string Cell(int column,int row){string name="";for(int n=column;n>0;n=(n-1)/26)name=(char)('A'+(n-1)%26)+name;return name+row;}
        var runs=new List<(int Column,int Start,int End)>();
        foreach(var column in addresses.Distinct().Select(At).GroupBy(p=>p.Column))
        {
            var rows=column.Select(p=>p.Row).Order().ToArray();int start=rows[0],end=start;
            foreach(int row in rows.Skip(1)){if(row==end+1)end=row;else{runs.Add((column.Key,start,end));start=end=row;}}
            runs.Add((column.Key,start,end));
        }
        foreach(var group in runs.GroupBy(r=>(r.Start,r.End)))
        {
            int[] columns=group.Select(r=>r.Column).Order().ToArray();int start=columns[0],end=start;
            string Range()=>Cell(start,group.Key.Start)+":"+Cell(end,group.Key.End);
            foreach(int column in columns.Skip(1)){if(column==end+1)end=column;else{yield return Range();start=end=column;}}
            yield return Range();
        }
    }
    public static string NumberFormat(string code)
    {
        code=Regex.Replace(code,@"\[\$-[a-zA-Z0-9-]+\]","");
        if(Regex.IsMatch(code,@"^(?:General|Standard|Основной|Общий|Стандарт)$",RegexOptions.IgnoreCase))return "General";
        // Quoted literals and currency/locale codes are preserved. Format token
        // case and redundant escapes of punctuation differ between office engines.
        return Regex.Replace(code,"\"(?:[^\"]|\"\")*\"|\\[[^\\]]*\\]|\\\\.|[^\"\\[\\\\]+",m=>m.Value.StartsWith('"')||m.Value.StartsWith('[')?m.Value:m.Value.StartsWith('\\')&&m.Value.Length==2&&!char.IsLetterOrDigit(m.Value[1])?m.Value[1..]:m.Value.ToLowerInvariant());
    }
    public static JsonObject? Normalize(JsonObject font,JsonObject alignment,string numberFormat)
    {
        var f=new JsonObject();
        foreach(string k in new[]{"name","size","color","bold","italic","underline","strike"})
        {
            var v=font[k];if(v is null)continue;
            bool standard=k switch{"name"=>v.GetValue<string>()=="Calibri","size"=>Math.Round(v.GetValue<double>(),2)==11,"color"=>v.GetValue<int>()==0,"underline"=>v.GetValue<string>()=="none",_=>!v.GetValue<bool>()};
            if(!standard)f[k]=k=="size"?JsonValue.Create(Math.Round(v.GetValue<double>(),2)):v.DeepClone();
        }
        var a=new JsonObject();
        foreach(string k in new[]{"horizontal","vertical","wrap","shrink","rotation"})
        {
            var v=alignment[k];if(v is null)continue;
            bool standard=k switch{"horizontal"=>v.GetValue<string>()=="general","vertical"=>v.GetValue<string>()=="bottom","rotation"=>v.GetValue<int>()==0,_=>!v.GetValue<bool>()};
            if(!standard)a[k]=v.DeepClone();
        }
        var result=new JsonObject();if(f.Count>0)result["font"]=f;if(a.Count>0)result["alignment"]=a;
        string code=NumberFormat(numberFormat);if(code!="General")result["numberFormat"]=code;
        return result.Count>0?result:null;
    }
    public static JsonObject?[] ReadStyles(XDocument? styles,XElement? scheme,string[]? indexed)
    {
        if(styles?.Root is null)return [null];
        var fonts=styles.Root.Element(S+"fonts")?.Elements(S+"font").ToArray()??[];
        var custom=styles.Root.Element(S+"numFmts")?.Elements(S+"numFmt").ToDictionary(e=>(int)e.Attribute("numFmtId")!,e=>(string)e.Attribute("formatCode")!)??[];
        var builtins=new Dictionary<int,string>{{0,"General"},{1,"0"},{2,"0.00"},{3,"#,##0"},{4,"#,##0.00"},{9,"0%"},{10,"0.00%"},{11,"0.00E+00"},{12,"# ?/?"},{13,"# ??/??"},{14,"mm-dd-yy"},{15,"d-mmm-yy"},{16,"d-mmm"},{17,"mmm-yy"},{18,"h:mm AM/PM"},{19,"h:mm:ss AM/PM"},{20,"h:mm"},{21,"h:mm:ss"},{22,"m/d/yy h:mm"},{37,"#,##0 ;(#,##0)"},{38,"#,##0 ;[Red](#,##0)"},{39,"#,##0.00;(#,##0.00)"},{40,"#,##0.00;[Red](#,##0.00)"},{45,"mm:ss"},{46,"[h]:mm:ss"},{47,"mmss.0"},{48,"##0.0E+0"},{49,"@"}};
        bool Flag(XElement? e)=>e is not null&&(string?)e.Attribute("val") is not ("0" or "false");
        return styles.Root.Element(S+"cellXfs")?.Elements(S+"xf").Select(xf=>{
            var source=fonts.ElementAtOrDefault((int?)xf.Attribute("fontId")??0);var font=new JsonObject();
            if(source is not null){
                font["name"]=(string?)source.Element(S+"name")?.Attribute("val")??"Calibri";
                font["size"]=(double?)source.Element(S+"sz")?.Attribute("val")??11;
                font["bold"]=Flag(source.Element(S+"b"));font["italic"]=Flag(source.Element(S+"i"));font["strike"]=Flag(source.Element(S+"strike"));
                string? underline=(string?)source.Element(S+"u")?.Attribute("val");font["underline"]=source.Element(S+"u") is null||underline=="none"?"none":underline is "double" or "doubleAccounting"?"double":"single";
                var color=source.Element(S+"color");font["color"]=color is null?0:LiveWorkbookXml.Fill(new XElement(S+"fill",new XElement(S+"patternFill",new XAttribute("patternType","solid"),new XElement(S+"fgColor",color.Attributes()))),scheme,indexed)??0;
            }
            var alignment=new JsonObject();var a=xf.Element(S+"alignment");
            if(a is not null){string h=(string?)a.Attribute("horizontal")??"general",v=(string?)a.Attribute("vertical")??"bottom";alignment["horizontal"]=h=="centerContinuous"?"center":h=="distributed"?"justify":h;alignment["vertical"]=v=="distributed"?"justify":v;alignment["wrap"]=(string?)a.Attribute("wrapText") is "1" or "true";alignment["shrink"]=(string?)a.Attribute("shrinkToFit") is "1" or "true";int r=(int?)a.Attribute("textRotation")??0;alignment["rotation"]=r>90&&r!=255?90-r:r;}
            int id=(int?)xf.Attribute("numFmtId")??0;string format=custom.GetValueOrDefault(id)??builtins.GetValueOrDefault(id)??throw new FormatException("Этот числовой формат требует обычного режима таблицы");
            return Normalize(font,alignment,format);
        }).ToArray()??[null];
    }
    public static JsonObject? Layout(XDocument sheet)
    {
        var ranges=sheet.Root?.Element(S+"mergeCells")?.Elements(S+"mergeCell").Select(e=>(string)e.Attribute("ref")!).Distinct().OrderBy(s=>s,StringComparer.Ordinal).ToArray()??[];
        return ranges.Length>0?new(){["merges"]=new JsonArray(ranges.Select(s=>(JsonNode)JsonValue.Create(s)!).ToArray())}:null;
    }
    public static JsonObject? ReadExcel(dynamic sheet,string address)
    {
        dynamic cell=address=="@"?sheet.Styles[1]:ExcelRange((object)sheet,address),font=cell.Font;
        try{
            int color=Convert.ToInt32(font.Color),h=Convert.ToInt32(cell.HorizontalAlignment),v=Convert.ToInt32(cell.VerticalAlignment),u=Convert.ToInt32(font.Underline);
            var f=new JsonObject{["name"]=(string)font.Name,["size"]=Convert.ToDouble(font.Size),["color"]=(color&255)<<16|color&0xff00|color>>16&255,["bold"]=Convert.ToBoolean(font.Bold),["italic"]=Convert.ToBoolean(font.Italic),["strike"]=Convert.ToBoolean(font.Strikethrough),["underline"]=u is -4119 or 5?"double":u is 2 or 4?"single":"none"};
            int rotation=Convert.ToInt32(cell.Orientation);
            var a=new JsonObject{["horizontal"]=h switch{-4131=>"left",-4108 or 7=>"center",-4152=>"right",5=>"fill",-4130 or -4117=>"justify",_=>"general"},["vertical"]=v switch{-4160=>"top",-4108=>"center",-4130 or -4117=>"justify",_=>"bottom"},["wrap"]=Convert.ToBoolean(cell.WrapText),["shrink"]=Convert.ToBoolean(cell.ShrinkToFit),["rotation"]=rotation switch{-4128=>0,-4166=>255,-4170=>-90,-4171=>90,_=>rotation}};
            object target=cell;
            string code=(string)target.GetType().InvokeMember("NumberFormat",BindingFlags.GetProperty,null,target,null,CultureInfo.GetCultureInfo("en-US"))!;
            return Normalize(f,a,code);
        }finally{Release(font);Release(cell);}
    }
    public static void WriteExcel(dynamic sheet,string address,JsonNode? format)
    {
        dynamic cell=address=="@"?sheet.Styles[1]:ExcelRange((object)sheet,address),font=cell.Font;
        try{
            var f=format?["font"];int color=f?["color"]?.GetValue<int>()??0;
            font.Name=f?["name"]?.GetValue<string>()??"Calibri";font.Size=f?["size"]?.GetValue<double>()??11;font.Color=(color&255)<<16|color&0xff00|color>>16&255;
            font.Bold=f?["bold"]?.GetValue<bool>()??false;font.Italic=f?["italic"]?.GetValue<bool>()??false;font.Strikethrough=f?["strike"]?.GetValue<bool>()??false;font.Underline=f?["underline"]?.GetValue<string>() switch{"single"=>2,"double"=>-4119,_=>-4142};
            var a=format?["alignment"];
            cell.HorizontalAlignment=a?["horizontal"]?.GetValue<string>() switch{"left"=>-4131,"center"=>-4108,"right"=>-4152,"fill"=>5,"justify"=>-4130,_=>1};
            cell.VerticalAlignment=a?["vertical"]?.GetValue<string>() switch{"top"=>-4160,"center"=>-4108,"justify"=>-4130,_=>-4107};
            cell.WrapText=a?["wrap"]?.GetValue<bool>()??false;cell.ShrinkToFit=a?["shrink"]?.GetValue<bool>()??false;
            int rotation=a?["rotation"]?.GetValue<int>()??0;cell.Orientation=rotation==255?-4166:rotation;
            object target=cell;
            target.GetType().InvokeMember("NumberFormat",BindingFlags.SetProperty,null,target,[format?["numberFormat"]?.GetValue<string>()??"General"],CultureInfo.GetCultureInfo("en-US"));
        }finally{Release(font);Release(cell);}
    }
    public static void UnmergeExcel(dynamic sheet,JsonNode? layout)
    {foreach(var range in layout?["merges"]?.AsArray()??[]){dynamic area=sheet.Range[range!.GetValue<string>()];try{area.UnMerge();}finally{Release(area);}}}
    public static void MergeExcel(dynamic sheet,JsonNode? layout)
    {foreach(var range in layout?["merges"]?.AsArray()??[]){dynamic area=sheet.Range[range!.GetValue<string>()];try{area.Merge();}finally{Release(area);}}}
}
