import fitz  # Библиотека PyMuPDF
import os

def combine_pdfs_in_folder(folder_path, output_txt_path):
    all_text = ""
    
    # Получаем список всех файлов в папке
    for filename in os.listdir(folder_path):
        # Проверяем, что это именно PDF
        if filename.endswith(".pdf"):
            pdf_path = os.path.join(folder_path, filename)
            print(f"Читаю книгу: {filename}...")
            
            try:
                doc = fitz.open(pdf_path)
                for page in doc:
                    all_text += page.get_text("text") + "\n"
            except Exception as e:
                print(f"Не удалось прочитать {filename}. Ошибка: {e}")

    # Сохраняем весь собранный текст в новый файл
    with open(output_txt_path, "w", encoding="utf-8") as f:
        f.write(all_text)

    print(f"\nУспех! Все книги объединены и сохранены в файл: {output_txt_path}")

# Путь к папке, который ты указал
folder_path = "/Users/timofeyivanyushkin/Downloads/книги_дача/"

# Название файла, который получится на выходе
output_file = "all_books_combined.txt"

# Запуск процесса
combine_pdfs_in_folder(folder_path, output_file)
