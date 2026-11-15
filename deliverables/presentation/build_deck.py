from pathlib import Path
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from PIL import Image

BASE = Path(__file__).resolve().parent
WEB = BASE.parents[1] / 'web-client'
OUT = BASE.parent / 'demo/public'
p = Presentation(BASE / 'template-original.pptx')
KEEP_SLIDES = [1, 3, 4, 6, 7, 9, 10]
T, W, M, D = '53CABE', 'EAF0EB', 'A5BBB9', '102426'
font = 'Arial'
head = 'Arial Narrow'


def txt(s, text, x, y, w, h, size=28, color=W, bold=False, family=font, align=PP_ALIGN.LEFT):
    sh = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = sh.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(text.split('\n')):
        par = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        par.alignment = align
        par.space_after = Pt(6)
        par.line_spacing = 1.08
        r = par.add_run()
        r.text = line
        r.font.name = family
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = RGBColor.from_string(color)
        r._r.get_or_add_rPr().set('lang', 'ru-RU')
    return sh


def rect(s, x, y, w, h, fill=D, line=None):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = RGBColor.from_string(fill)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = RGBColor.from_string(line)
        sh.line.width = Pt(1)
    else:
        sh.line.fill.background()
    return sh


def line(s,x,y,w,color=T):
    rect(s,x,y,w,.015,color)


def picture(s, path, x, y, w, h, crop=None):
    if crop:
        sh = s.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
        sh.crop_left, sh.crop_top, sh.crop_right, sh.crop_bottom = crop
    else:
        iw, ih = Image.open(path).size
        scale = min(w / iw, h / ih)
        pw, ph = iw * scale, ih * scale
        sh = s.shapes.add_picture(str(path), Inches(x+(w-pw)/2), Inches(y+(h-ph)/2), Inches(pw), Inches(ph))
    return sh


def title(s,a,b,x=1.1,y=1.2,w=17.8,size=78):
    txt(s,a,x,y,w,1.25,size,W,True,head)
    txt(s,b,x,y+1.13,w,1.25,size,T,True,head)


def clean(n, keep):
    s=p.slides[n-1]
    for i,sh in reversed(list(enumerate(s.shapes))):
        if i not in keep:
            sh._element.getparent().remove(sh._element)
    return s


def footer(s,n,label):
    txt(s,'ASTRAS',1.1,10.65,2,.3,16,T,True)
    txt(s,label,3.0,10.65,13,.3,14,M)
    txt(s,f'{(KEEP_SLIDES.index(n)+1 if n in KEEP_SLIDES else 0):02d} / 07',17.6,10.65,1.3,.3,14,M,align=PP_ALIGN.RIGHT)


def block(s,num,name,body,x,y,w):
    txt(s,num,x,y,.65,.5,25,T,True,head)
    txt(s,name,x+.85,y,w-.85,.5,28,W,True,head)
    txt(s,body,x+.85,y+.68,w-.85,1.45,24,M)


s=clean(1,{0,2})
txt(s,'ASTRAS  /  CHALLENGE 5',1.1,1.15,8,.45,23,W,True,head)
txt(s,'ОТ ЗЕМЛИ К ДАЛЬНИМ МИРАМ',13.15,1.28,6.2,.38,18,W,True,head)
txt(s,'ЗЕМНЫЕ АНАЛОГИ\nЛУНЫ И МАРСА',1.1,4.72,12,1.8,48,W,True,head)
brand=txt(s,'AST',.95,7.1,17,2.65,200,T,True,head)
r=brand.text_frame.paragraphs[0].add_run()
r.text='RAS';r.font.name=head;r.font.size=Pt(200);r.font.bold=True;r.font.color.rgb=RGBColor.from_string(W)
txt(s,'Исследовать ландшафт. Проверить сходство. Сохранить доказательства.',1.15,10.18,17,.5,25,W)

s=clean(2,{0,1,2})
title(s,'ГДЕ НА ЗЕМЛЕ','ЛУНА И МАРС?',w=12.5,size=78)
txt(s,'ЗАДАЧА 05 · ЗЕМНЫЕ АНАЛОГИ',1.1,4.82,6.3,.38,21,W,True,head)
txt(s,'Будущие миссии\nначинаются\nс земных полигонов.',1.1,6.15,6.3,2.2,32,W)
line(s,1.1,8.8,5.7)
txt(s,'Внешнего сходства\nнедостаточно.',1.1,9.15,6.3,1,24,M)
block(s,'01','ВЫБРАТЬ МЕСТО','Найти ландшафт под конкретную исследовательскую задачу.',14.0,2.0,5.0)
block(s,'02','ПРОВЕРИТЬ ДАННЫЕ','Сопоставить рельеф в одном масштабе.',14.0,4.75,5.0)
block(s,'03','ОБОСНОВАТЬ ВЫБОР','Связать результат с источником и научной публикацией.',14.0,7.5,5.0)
footer(s,2,'Проблема → воспроизводимый поиск аналогов')

s=clean(3,{18})
txt(s,'ЗАДАЧА 05',1.1,1.1,5.2,.5,24,T,True,head)
block(s,'01','НАЙТИ','Земные полигоны для\nисследований Луны и Марса.',1.1,2.05,5.5)
block(s,'02','ПРОВЕРИТЬ','Сопоставить поверхности\nпо реальным измерениям.',1.1,4.45,5.5)
block(s,'03','ОБОСНОВАТЬ','Сохранить результат,\nисточники и научный контекст.',1.1,6.85,5.5)
picture(s,OUT/'earth-sharp-global.png',7.3,1.05,11.55,6.1)
rect(s,7.3,1.05,11.55,6.1,None,'2B5958')
title(s,'ТРИ МИРА','ОДНА СРЕДА',x=8.6,y=7.7,w=10.7,size=75)
txt(s,'20 планетарных ландшафтов в каталоге',1.1,9.7,6.7,.6,21,M)
footer(s,3,'Скриншот рабочего прототипа ASTRAS')

s=clean(4,set())
title(s,'АНАЛОГИ','НА ЗЕМЛЕ',w=8,size=69)
txt(s,'8',1.1,4.1,2.5,1.2,82,T,True,head)
txt(s,'регионов',3.0,4.63,4.8,.6,30,W)
txt(s,'2 261',1.1,5.65,5.6,1.2,76,W,True,head)
txt(s,'пригодное окно рельефа',1.1,6.92,6.2,.6,26,M)
line(s,1.1,7.95,5.8)
txt(s,'828 км²\nобследованных областей',1.1,8.4,6.2,1.2,28,W)
mapx,mapy,mapw,maph=8.1,1.65,10.8,5.4
picture(s,WEB/'public/assets/earth-context/blue-marble-5400.jpg',mapx,mapy,mapw,maph)
points=[('1',43.4,54.5),('2',-24.08679,-69.91321),('3',37.725275,-6.5597),('4',75.415,-89.635),('5',19.367,-155.201),('6',29.184656,-13.483496),('7',-21.11094,119.13709),('8',-77.861133,160.712267)]
for n,lat,lon in points:
    xx=mapx+(lon+180)/360*mapw
    yy=mapy+(90-lat)/180*maph
    sh=s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(xx-.17), Inches(yy-.17), Inches(.34), Inches(.34))
    sh.fill.solid();sh.fill.fore_color.rgb=RGBColor.from_string(T);sh.line.fill.background()
    txt(s,n,xx-.15,yy-.145,.3,.3,14,'071011',True,align=PP_ALIGN.CENTER)
txt(s,'1  Устюрт · Казахстан\n2  Атакама · Чили\n3  Рио-Тинто · Испания\n4  Хотон · Канада',8.15,7.6,5.35,2.35,23,W)
txt(s,'5  Гавайи · США\n6  Лансароте · Испания\n7  Пилбара · Австралия\n8  Сухие долины · Антарктида',13.6,7.6,5.4,2.35,23,W)
footer(s,4,'Карта: NASA Blue Marble · обследованы отдельные области внутри регионов')

s=clean(5,{1,4})
title(s,'НАУЧНАЯ','ОСНОВА',x=4.5,y=.9,w=12,size=78)
txt(s,'7 ПЕРВИЧНЫХ ПУБЛИКАЦИЙ',10.0,4.45,8.8,.5,26,T,True,head)
for y,num,name,body in [(5.35,'01','РИО-ТИНТО','Биомаркеры и повторное бурение\nSánchez-García et al., 2020'),(7.0,'02','ХОТОН','Неоднородность импактных расплавов\nGreenberger et al., 2020'),(8.65,'03','ЛАНСАРОТЕ','Магнитные исследования лавовой трубки\nMartín de Blas et al., 2026')]:
    txt(s,num,10,y,.7,.45,24,T,True,head)
    txt(s,name,10.9,y,7.8,.45,27,W,True,head)
    txt(s,body,10.9,y+.52,7.8,.95,22,M)
footer(s,5,'DOI и библиография — в заметках; результаты статей используются как научный контекст')

s=clean(6,{5})
picture(s,OUT/'global-research-appendix.png',1.1,1.12,5.62,9.0)
title(s,'РЕЛЬЕФ В ОДНОМ','МАСШТАБЕ',x=8.1,y=1.0,w=11,size=70)
txt(s,'ДАННЫЕ + 7 НАУЧНЫХ ПУБЛИКАЦИЙ',8.15,3.7,10,.5,26,T,True,head)
txt(s,'Земля    Copernicus GLO-30 DSM\nЛуна     LOLA · район Шеклтона\nМарс     HiRISE · кратер Езеро',8.15,4.4,10.7,1.75,28,W)
line(s,8.15,6.5,10.6)
txt(s,'600 × 600 м',8.15,6.95,5.7,.9,48,T,True,head)
txt(s,'10 × 10',14.1,6.95,4.7,.9,48,W,True,head)
txt(s,'размер окна',8.15,7.95,5.2,.5,25,M)
txt(s,'ячеек · шаг 60 м',14.1,7.95,4.8,.5,25,M)
txt(s,'Сравниваем уклоны и перепад высот.\nРанжируем кандидатов внутри выбранного региона.',8.15,9.05,10.6,1.1,24,W)
footer(s,6,'Две цели для расчёта сходства · геология и биомаркеры — контекст из научных статей')

s=clean(7,set())
txt(s,'ЧЕТЫРЕ ОСТАНОВКИ',1.1,1.1,5.4,.5,25,T,True,head)
for y,num,name,body in [(2.0,'01','ВЫБРАТЬ','Цель и научный вопрос.'),(3.25,'02','ИЗУЧИТЬ','Исходную поверхность.'),(4.5,'03','НАЙТИ АНАЛОГ','Регион и публикацию.'),(5.75,'04','ПРОВЕРИТЬ','Сходство и доказательства.')]:
    txt(s,num,1.1,y,.65,.4,24,T,True,head)
    txt(s,name,1.95,y,4.8,.45,27,W,True,head)
    txt(s,body,1.95,y+.5,4.8,.6,23,M)
# Native crop keeps the measured surfaces and removes obsolete screenshot chrome.
picture(s,OUT/'unified-comparison-desktop.png',7.2,1.85,11.7,4.3875,crop=(0,.27,0,.13))
rect(s,7.2,1.85,11.7,4.3875,None,'2B5958')
title(s,'ВАША','ЭКСПЕДИЦИЯ',x=1.1,y=7.4,w=9.0,size=70)
txt(s,'ИНТЕРАКТИВНОЕ 3D-СРАВНЕНИЕ',10.6,7.65,8.1,.6,30,T,True,head)
txt(s,'Синхронная камера, общая шкала высот,\nизолинии и профиль поверхности.\nВопросы по результатам исследований.',10.6,8.45,8.1,1.7,26,W)
footer(s,7,'Скриншот сравнения Земля / Марс · интерполяция не добавляет новых измерений')

s=clean(8,{0,4,13})
for y,num,name,body in [(1.1,'01','ВЫБРАТЬ ЦЕЛЬ','Луна или Марс и исследовательский вопрос.'),(2.8,'02','ИЗУЧИТЬ ПОВЕРХНОСТЬ','Орбитальный обзор и исходные данные.'),(4.5,'03','НАЙТИ ЗЕМНОЙ АНАЛОГ','Регион, статья и вопрос по её результатам.')]:
    txt(s,num,1.1,y,.65,.4,24,T,True,head)
    txt(s,name,1.95,y,5.8,.45,26,W,True,head)
    txt(s,body,1.95,y+.55,5.8,.85,23,M)
title(s,'ВАША','ЭКСПЕДИЦИЯ',x=8.9,y=2.05,w=10.5,size=79)
txt(s,'ИССЛЕДОВАТЕЛЬСКИЙ МАРШРУТ',9.4,5.8,6.5,.42,22,W,True,head)
txt(s,'04',8.9,7.1,.9,.7,40,T,True,head)
txt(s,'ПРОВЕРИТЬ ГИПОТЕЗУ',10.0,7.18,8.8,.5,31,W,True,head)
txt(s,'Сравнить рельеф, ответить на вопрос\nи открыть доказательства.',10.0,8.0,8.8,1.25,28,M)
footer(s,8,'Четыре остановки · обратная связь по опубликованным исследованиям')

s=clean(9,{16})
title(s,'НАУЧНЫЙ','ОТЧЁТ',x=1.1,y=1.05,w=8.5,size=86)
txt(s,'РЕЗУЛЬТАТ ОСТАЁТСЯ У ВАС',1.1,4.81,6.5,.45,23,W,True,head)
txt(s,'PDF',1.1,6.15,4.5,1.2,78,T,True,head)
txt(s,'6 страниц\nс визуализациями\nи источниками',1.1,7.6,5.4,1.8,31,W)
picture(s,BASE/'assets/report-page.png',7.0,2.0,6.4,8.0)
block(s,'01','ДАННЫЕ','Координаты, метрики\nи границы поиска.',14.0,2.1,5.0)
block(s,'02','ВИЗУАЛИЗАЦИИ','Высотные карты,\nпрофили и сравнение.',14.0,4.75,5.0)
block(s,'03','ПРОВЕРЯЕМОСТЬ','Статьи, источники\nи SHA-256 данных.',14.0,7.4,5.0)
footer(s,9,'Страница реального отчёта ASTRAS · Рио-Тинто / Марс')

s=clean(10,{6})
picture(s,OUT/'unified-profile-desktop.png',.8,1.8,7,7.5)
title(s,'ИССЛЕДОВАТЬ','И ОБОСНОВАТЬ',x=8.1,y=1.05,w=11,size=70)
txt(s,'ОТ ВЫБОРА ЦЕЛИ К ОТЧЁТУ',8.15,4.0,10.7,.55,30,T,True,head)
for x,val,label in [(8.15,'01','выбрать регион'),(11.95,'02','сравнить рельеф'),(15.7,'03','скачать отчёт')]:
    txt(s,val,x,4.95,3.5,1.0,62,W,True,head)
    txt(s,label,x,6.05,3.5,.8,21,M)
line(s,8.15,7.0,10.7)
txt(s,'ПОПРОБУЙТЕ',8.15,7.45,3,.5,27,T,True,head)
txt(s,'Рио-Тинто → Марс → 3D-сравнение.\nОткройте статью и сохраните результат.',8.15,8.1,10.6,1.25,28,W)
sh=txt(s,'ОТКРЫТЬ ПРОЕКТ НА GITHUB  ↗',8.15,9.68,10.6,.55,26,T,True,head)
sh.text_frame.paragraphs[0].runs[0].hyperlink.address='https://github.com/Eliasans02/planetary-analog-explorer/tree/codex/performance-baseline'
footer(s,10,'Прототип для исследования аналогов; не оценка безопасности посадки или базы')

content=json.loads((BASE/'content-ru.json').read_text())
for i,s in enumerate(p.slides):
    notes=content['slides'][i]['notes']
    if i==9:
        notes+='\n\n'+content['slides'][10]['notes']+'\n'+content['slides'][10]['url']
    if i==4:
        notes+='\n\nБиблиография каталога:\nАтакама: https://doi.org/10.3390/microorganisms9051038\nРио-Тинто: https://doi.org/10.1089/ast.2019.2101\nХотон: https://doi.org/10.1029/2019JE006218\nГавайи: https://doi.org/10.1089/ast.2018.1847\nЛансароте: https://doi.org/10.1029/2025JE009616\nПилбара: https://doi.org/10.1016/j.icarus.2013.02.006\nСухие долины: https://doi.org/10.3389/fmicb.2021.616730\nДля Сухих долин: статья относится к долине Тейлора, а область поиска расположена в долине Университетской; это региональный контекст.'
    if i==5:
        notes+=p.slides[4].notes_slide.notes_text_frame.text+'\n\n'
        notes+='\nCopernicus GLO-30 — цифровая модель поверхности (DSM), которая может включать растительность и сооружения. 600 м — размер окна; между центрами крайних ячеек 540 м.'
    if i==6:
        notes+=content['slides'][7]['notes']+'\n\n'
        notes+='\nИзображение демонстрирует интерфейс сравнения Устюрт / Езеро; оно не относится к примеру Рио-Тинто на следующем слайде отчёта.'
    if i==8:
        notes+='\nПример: rio-tinto-r07-c01, сравнение с Марсом. 73 пригодных окна, 27 исключено по водной маске. Расстояние 0,163582; перепад высот 21,319 м; средний уклон 3,501°. Значение расстояния не является вероятностью или глобальным рейтингом.'
    notes+='\n\nОформление адаптировано из Canva: Black Teal and White Futuristic Space Exoplanets Presentation, BlakeCube. https://www.canva.com/templates/EAHX_ZJYjrE/'
    s.notes_slide.notes_text_frame.text=notes
p.core_properties.title='ASTRAS — Земные аналоги Луны и Марса'
p.core_properties.subject='Challenge 5 · исследование земных аналогов планетарных ландшафтов'
p.core_properties.author='ASTRAS'
p.core_properties.keywords='ASTRAS, Challenge 5, земные аналоги, Луна, Марс'
for i in reversed(range(len(p.slides))):
    if i+1 not in KEEP_SLIDES:
        item=p.slides._sldIdLst[i]
        p.part.drop_rel(item.rId)
        p.slides._sldIdLst.remove(item)
for rel in p.part.rels.values():
    if rel.reltype.endswith('/slideMaster'):
        for mr in rel.target_part.rels.values():
            if mr.reltype.endswith('/theme'):
                from lxml import etree
                theme=etree.fromstring(mr.target_part.blob)
                for color in theme.xpath('//*[local-name()="hlink" or local-name()="folHlink"]/*'):
                    color.set('val',T)
                mr.target_part._blob=etree.tostring(theme)
p.save(BASE/'ASTRAS_Презентация_RU.pptx')
print('Saved 7 slides with Russian speaker notes:', BASE/'ASTRAS_Презентация_RU.pptx')
